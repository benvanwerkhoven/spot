/**
 * Implementation of a dataset backed by Crossfilter, ie. fully client side filtering without the need for a server or database.
 * Due to limitation of crossfilter with array (or data that has no natrual ordering), this will not work as expected:
 * * dimension: `function (d) {return [d.x, d.y, d.z]}`
 * * group: `function (d) {return [d.x / 10 , d.y / 10, d.z / 10]}`
 *
 * Therfore, we preform grouping already in the dimension itself, and join the array to a string.
 * Strings have a natural ordering and thus can be used as dimension value.
 * * dimension: `function (d) -> "d.x/10|d.y/10|d.z/10"`
 * * group: `function (d) {return d;}`
 * @module client/dataset-client
 */
var moment = require('moment-timezone');

var Dataset = require('./dataset');

var utildx = require('../util-crossfilter');
var misval = require('../misval');

var grpIdxToName = {0: 'a', 1: 'b', 2: 'c', 3: 'd', 4: 'e'};
var aggIdxToName = {0: 'aa', 1: 'bb', 2: 'cc', 3: 'dd', 4: 'ee'};

/**
 * Crossfilter instance, see [here](http://square.github.io/crossfilter/)
 */
var crossfilter = require('crossfilter2')([]);
var countGroup = crossfilter.groupAll().reduceCount();

/**
 * setMinMax sets the range of a continuous or time facet
 * @param {Dataset} dataset
 * @param {Facet} facet
 */
function setMinMax (dataset, facet) {
  facet.timeTransform.forceDatetime = true;

  var fn = utildx.valueFn(facet);
  var rawFn = utildx.baseValueFn(facet);

  var group = dataset.crossfilter.groupAll();

  var lessFn;
  var moreFn;
  if (facet.isTimeOrDuration && facet.timeTransform.isDatetime) {
    lessFn = function (a, b) {
      if (b === misval || a.isBefore(b)) {
        return true;
      } else {
        return false;
      }
    };
    moreFn = function (a, b) {
      if (b === misval || b.isBefore(a)) {
        return true;
      } else {
        return false;
      }
    };
  } else {
    lessFn = function (a, b) {
      if (b === misval || a < b) {
        return true;
      }
      return false;
    };
    moreFn = function (a, b) {
      if (b === misval || a > b) {
        return true;
      }
      return false;
    };
  }

  group.reduce(
    function (p, d) { // add
      var rawV = rawFn(d);
      var v = fn(d);
      if (v === misval) {
        return p;
      }
      if (lessFn(v, p.min)) {
        p.min = v;
        p.rawMin = rawV;
      }
      if (moreFn(v, p.max)) {
        p.max = v;
        p.rawMax = rawV;
      }
      return p;
    },
    function (p, v) { // subtract
      return p;
    },
    function () { // initialize
      return {
        min: misval,
        max: misval,
        rawMin: misval,
        rawMax: misval
      };
    }
  );
  var value = group.value();
  if (facet.isContinuous) {
    facet.minvalAsText = value.min.toString();
    facet.maxvalAsText = value.max.toString();
  } else if (facet.isTimeOrDuration) {
    if (facet.timeTransform.isDatetime) {
      facet.minvalAsText = value.min.toString();
      facet.maxvalAsText = value.max.toString();
    } else if (facet.timeTransform.isDuration) {
      facet.minvalAsText = moment.duration(value.rawMin, facet.timeTransform.transformedUnits).toJSON();
      facet.maxvalAsText = moment.duration(value.rawMax, facet.timeTransform.transformedUnits).toJSON();
    }
  }
  facet.rawMinval = value.rawMin;
  facet.rawMaxval = value.rawMax;
  group.dispose();

  facet.timeTransform.forceDatetime = false;
}

/**
 * sampleDataset returns an array containing N random datums from the dataset
 * @param {Dataset} dataset
 * @param {intger} N Number of elements to pick
 * @returns {Object[]} Array N data Objects
 */
function sampleDataset (dataset, N) {
  var wantedElements = [];

  var i;
  for (i = 0; i < N; i++) {
    wantedElements[i] = Math.round(Math.random() * dataset.crossfilter.size());
  }

  var group = dataset.crossfilter.groupAll();
  group.reduce(
    function (p, d) { // add
      var i = wantedElements.indexOf(p.element);
      if (i > -1) {
        p.data[i] = d;
      }
      p.element++;
      return p;
    },
    function (p, v) { // subtract
      return p;
    },
    function () { // initialize
      return {
        element: 0,
        data: []
      };
    }
  );
  return group.value().data;
}

/**
 * setCategories finds finds all values on an ordinal (categorial) axis
 * Updates the categorialTransform of the facet
 *
 * @param {Dataset} dataset
 * @param {Facet} facet
 */
function setCategories (dataset, facet) {
  var fn = utildx.baseValueFn(facet);

  var group = dataset.crossfilter.groupAll();
  group.reduce(
    function (p, v) { // add
      var vals = fn(v);
      if (!(vals instanceof Array)) {
        vals = [vals];
      }
      vals.forEach(function (val) {
        if (p.hasOwnProperty(val)) {
          p[val]++;
        } else {
          p[val] = 1;
        }
      });
      return p;
    },
    function (p, v) { // subtract
      var vals = fn(v);
      if (!(vals instanceof Array)) {
        vals = [vals];
      }
      vals.forEach(function (val) {
        p[val]--;
      });
      return p;
    },
    function () { // initialize
      return {};
    }
  );

  facet.categorialTransform.reset();

  var data = group.value();
  Object.keys(data).forEach(function (key) {
    // TODO: missing data should be mapped to a misval from misvalAsText
    var keyAsString = key.toString();
    var groupAsString = keyAsString;

    facet.categorialTransform.rules.add({expression: keyAsString, count: data[key], group: groupAsString});
  });
}

/**
 * Calculate 100 percentiles (ie. 1,2,3,4 etc.), and initialize the `facet.continuousTransform`
 * to an approximate percentile mapping.
 * Use the recommended method from [NIST](http://www.itl.nist.gov/div898/handbook/prc/section2/prc262.htm)
 * See also the discussion on [Wikipedia](https://en.wikipedia.org/wiki/Percentile)
 * @param {Dataset} dataset
 * @param {Facet} facet
 */
function setPercentiles (dataset, facet) {
  var basevalueFn = utildx.baseValueFn(facet);
  var dimension = dataset.crossfilter.dimension(basevalueFn);
  var data = dimension.bottom(Infinity);
  dimension.dispose();

  var tf = facet.continuousTransform;
  var x, i;

  // drop missing values, which should be sorted at the start of the array
  i = 0;
  while (basevalueFn(data[i]) === misval) i++;
  data.splice(0, i);

  // start clean
  tf.reset();

  // add minimum value as control points p0 and p1
  tf.cps.add({x: basevalueFn(data[0]), fx: 0});
  tf.cps.add({x: basevalueFn(data[0]), fx: 0});

  var p, value;
  for (p = 1; p < 100; p++) {
    x = (p * 0.01) * (data.length + 1) - 1; // indexing starts at zero, not at one
    i = Math.trunc(x);
    value = (1 - x + i) * basevalueFn(data[i]) + (x - i) * basevalueFn(data[i + 1]);
    tf.cps.add({x: value, fx: p});
  }

  // add maximum value as p101 and p102
  tf.cps.add({x: basevalueFn(data[data.length - 1]), fx: 100});
  tf.cps.add({x: basevalueFn(data[data.length - 1]), fx: 100});

  tf.type = 'percentiles';
}

/**
 * Calculate value where exceedance probability is one in 10,20,30,40,50,
 * and the same for subceedance (?), ie the exceedance of the dataset where each point is replaced by its negative.
 * Approximate from data: 1 in 10 is larger than value at index trunc(0.1 * len(data))
 * Set the `facet.continuousTransform` to the approximate mapping.
 * @param {Dataset} dataset
 * @param {Facet} facet
 */
function setExceedances (dataset, facet) {
  var basevalueFn = utildx.baseValueFn(facet);
  var dimension = dataset.crossfilter.dimension(basevalueFn);
  var data = dimension.bottom(Infinity);
  dimension.dispose();

  var exceedances = [];
  var i, oom, mult, n, value, valuep, valuem;

  // drop missing values, which should be sorted at the start of the array
  i = 0;
  while (basevalueFn(data[i]) === misval) i++;
  data.splice(0, i);

  // exceedance:
  // '1 in n' value, or what is the value x such that the probabiltiy drawing a value y with y > x is 1 / n

  if (data.length % 2 === 0) {
    valuem = basevalueFn(data[(data.length / 2) - 1]);
    valuep = basevalueFn(data[(data.length / 2)]);
    value = 0.5 * (valuem + valuep);
  } else {
    value = basevalueFn(data[(Math.trunc(data.length / 2))]);
  }
  exceedances = [{x: value, fx: 0}];

  // order of magnitude
  oom = 1;
  mult = 3;
  while (mult * oom < data.length) {
    n = oom * mult;

    // exceedance
    i = data.length - Math.trunc(data.length / n) - 1;
    value = basevalueFn(data[i]);

    exceedances.push({x: value, fx: n});

    // subceedance (?)
    i = data.length - i - 1;
    value = basevalueFn(data[i]);

    exceedances.unshift({x: value, fx: -n});

    mult++;
    if (mult === 10) {
      oom = oom * 10;
      mult = 1;
    }
  }

  // add minimum and maximum values
  exceedances.unshift({x: basevalueFn(data[0]), fx: -data.length});
  exceedances.push({x: basevalueFn(data[data.length - 1]), fx: data.length});

  // start clean
  facet.continuousTransform.reset();

  // generate rules
  exceedances.forEach(function (ex) {
    facet.continuousTransform.cps.add(ex);
  });

  facet.continuousTransform.type = 'exceedances';
}

/**
 * Autoconfigure a dataset:
 * 1. pick 10 random elements
 * 2. create facets for their properties
 * 3. add facets' values over the sample to the facet.description
 *
 * @param {Dataset} dataset
 */
function scanData (dataset) {
  function facetExists (dataset, path) {
    var exists = false;
    dataset.facets.forEach(function (f) {
      if (f.accessor === path || f.accessor === path + '[]') {
        exists = true;
      }
    });
    return exists;
  }

  function addValue (values, v, missing) {
    if (v === misval) {
      v = missing;
    }
    if (values.indexOf(v) === -1) {
      values.push(v);
    }
  }

  function guessType (values) {
    var mytype = {
      continuous: 0,
      categorial: 0,
      datetime: 0,
      duration: 0
    };
    var jstype = {};
    values.forEach(function (value) {
      if (moment(value, moment.ISO_8601).isValid()) {
        // "2016-08-17 17:25:00+01"
        mytype.datetime++;
      } else if (
          (moment.duration(value).asMilliseconds() !== 0) &&
          (typeof value === 'string') &&
          (value[0].toLowerCase() === 'p')) {
        // "P10Y"
        mytype.duration++;
      } else if (value == +value) {  // eslint-disable-line eqeqeq
        // "10" or 10
        mytype.continuous++;
      } else {
        // "hello world"
        mytype.categorial++;
      }
      jstype[typeof value] = jstype[typeof value] || 0;
      jstype[typeof value]++;
    });

    var max;

    max = -1;
    var facetType;
    Object.keys(mytype).forEach(function (key) { if (mytype[key] > max) { facetType = key; max = mytype[key]; } });

    return facetType;
  }

  function tryFacet (dataset, path, value) {
    // Check for existence
    if (facetExists(dataset, path)) {
      return;
    }

    // Create a new facet
    var facet = dataset.facets.add({
      name: path,
      accessor: path,
      type: 'categorial',
      misvalAsText: '"null"'
    });

    // Sample values
    var baseValueFn = utildx.baseValueFn(facet);
    var values = [];
    var isArray = false;

    data.forEach(function (d) {
      var value = baseValueFn(d);
      if (value instanceof Array) {
        isArray = true;
        value.forEach(function (v) {
          addValue(values, v, facet.misval[0]);
        });
      } else {
        addValue(values, value, facet.misval[0]);
      }
    });

    // Reconfigure facet
    var type = guessType(values);
    facet.accessor = isArray ? facet.accessor + '[]' : facet.accessor;
    if (type === 'datetime') {
      facet.type = 'timeorduration';
      facet.timeTransform.type = 'datetime';
    } else if (type === 'duration') {
      facet.type = 'timeorduration';
      facet.timeTransform.type = 'duration';
    } else {
      facet.type = type;
    }
    facet.description = values.join(', ');
  }

  function recurse (dataset, path, tree) {
    var props = Object.getOwnPropertyNames(tree);
    props.forEach(function (name) {
      var subpath;
      if (path) subpath = path + '.' + name; else subpath = name;

      if (tree[name] instanceof Array) {
        // add an array as a itself as a facet, ie. labelset, to prevent adding each element as separate facet
        // also add the array length as facet
        tryFacet(dataset, subpath, tree[name]);
        tryFacet(dataset, subpath + '.length', tree[name].length);
      } else if (tree[name] instanceof Object) {
        // recurse into objects
        recurse(dataset, subpath, tree[name]);
      } else {
        // add strings and numbers as facets
        tryFacet(dataset, subpath, tree[name]);
      }
    });
  }

  // Add facets
  var data = sampleDataset(dataset, 10);
  data.forEach(function (d) {
    recurse(dataset, '', d);
  });
}

/**
 * Initialize the data filter, and construct the getData callback function on the filter.
 * @param {Dataset} dataset
 * @param {Filter} filter
 */
function initDataFilter (dataset, filter) {
  var facet;

  // use the partitions as groups:
  var groupFns = [];
  filter.partitions.forEach(function (partition) {
    facet = dataset.facets.get(partition.facetId);
    var valueFn = utildx.valueFn(facet);
    var groupFn = utildx.groupFn(partition);

    var rank = partition.rank;
    groupFns[rank - 1] = function (d) {
      return groupFn(valueFn(d));
    };
  });

  // and then create keys from the group values
  var groupsKeys = function (d) {
    var keys = [];

    groupFns.forEach(function (groupFn) {
      var result = groupFn(d);
      var newKeys = [];
      if (keys.length === 0) {
        if (result instanceof Array) {
          newKeys = result;
        } else {
          newKeys = [result];
        }
      } else {
        if (result instanceof Array) {
          keys.forEach(function (oldKey) {
            result.forEach(function (key) {
              newKeys.push(oldKey + '|' + key);
            });
          });
        } else {
          keys.forEach(function (oldKey) {
            newKeys.push(oldKey + '|' + result);
          });
        }
      }
      keys = newKeys;
    });
    return keys;
  };

  // set up the facet valueFns to aggregate over
  // and the reduction functions for them
  var aggregateFns = [];
  var reduceFns = [];
  if (filter.aggregates.length === 0) {
    // fall back to just counting item
    aggregateFns[0] = function (d) { return 1; };
    reduceFns[0] = function (d) {
      if (d === misval || d == null) {
        return misval;
      }
      if (d.count > 0) {
        return d.count;
      } else {
        return misval;
      }
    };
  } else {
    filter.aggregates.forEach(function (aggregate) {
      facet = dataset.facets.get(aggregate.facetId);
      aggregateFns.push(utildx.valueFn(facet));
      reduceFns.push(utildx.reduceFn(aggregate));
    });
  }

  // setup the crossfilter dimensions and groups
  filter.dimension = dataset.crossfilter.dimension(function (d) {
    return groupsKeys(d);
  }, true);
  var group = filter.dimension.group(function (d) { return d; });

  group.reduce(
    function (p, d) { // add
      aggregateFns.forEach(function (aggregateFn, i) {
        var val = aggregateFn(d);
        if (val !== misval) {
          p[i] = p[i] || {count: 0, sum: 0};
          p[i].count += 1;
          p[i].sum += parseFloat(val);
        }
      });
      return p;
    },
    function (p, d) { // subtract
      aggregateFns.forEach(function (aggregateFn, i) {
        var val = aggregateFn(d);
        if (val !== misval) {
          p[i] = p[i] || {count: 0, sum: 0};
          p[i].count -= 1;
          p[i].sum -= parseFloat(val);
        }
      });
      return p;
    },
    function () { // initialize
      return [];
    }
  );

  filter.getData = function () {
    filter.data = [];

    // Get data from crossfilter
    var groups = group.all();

    // { key: "group1|group2|...",
    //   value: [ {count: agg1, sum: agg1}
    //            {count: agg2, sum: agg2}
    //            {count: agg3, sum: agg3}
    //                    ...             ]}
    groups.forEach(function (group) {
      var item = {};

      // turn the string back into individual group values
      var groupsKeys;
      if (typeof group.key === 'string') {
        groupsKeys = group.key.split('|');
      } else {
        // shortcut for numeric non-partitioned case
        groupsKeys = [group.key];
      }

      // add paritioning data to the item
      groupsKeys.forEach(function (subkey, i) {
        item[grpIdxToName[i]] = subkey;
      });

      // add aggregated data to the item
      reduceFns.forEach(function (reduceFn, i) {
        item[aggIdxToName[i]] = reduceFn(group.value[i]);
      });

      filter.data.push(item);
    });

    // update counts
    dataset.dataTotal = dataset.crossfilter.size();
    dataset.dataSelected = dataset.countGroup.value();

    filter.trigger('newData');
  };
}

/**
 * The opposite or initDataFilter, it should remove the filter and deallocate other configuration
 * related to the filter.
 * @param {Dataset} dataset
 * @param {Filter} filter
 */
function releaseDataFilter (dataset, filter) {
  if (filter.dimension) {
    filter.dimension.filterAll();
    filter.dimension.dispose();
    delete filter.dimension;
    delete filter.getData;
  }
}

/**
 * Change the filter parameters for an initialized filter
 * @param {Dataset} dataset
 * @param {Filter} filter
 */
function updateDataFilter (dataset, filter) {
  if (filter.dimension) {
    filter.dimension.filterFunction(filter.filterFunction());
  }
}

module.exports = Dataset.extend({
  props: {
    datasetType: {
      type: 'string',
      setOnce: true,
      default: 'client'
    }
  },

  /*
   * Implementation of virtual methods
   */
  scanData: function () {
    scanData(this);
  },
  setMinMax: setMinMax,
  setCategories: setCategories,
  setPercentiles: setPercentiles,
  setExceedances: setExceedances,

  initDataFilter: initDataFilter,
  releaseDataFilter: releaseDataFilter,
  updateDataFilter: updateDataFilter,

  /*
   * Crossfilter Object, for generating dimensions
   */
  crossfilter: crossfilter,
  countGroup: countGroup
});