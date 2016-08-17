/**
 * Utility functions for SQL datasets for use on the server
 *
 * Approach:
 * 1. The dataset, including Facets and Filters, is kept in sync with the client (website) using the 'syncFacet' requests
 * 2. An SQL view is created holding the transformed values of all active facets
 * 3. On a 'newData' request, construct a query using the relevant `Facet.groups`
 * 4, Execute the query, and send back the results
 *
 * @module client/util-sql
 */

var io = require('./server-socket');
var squel = require('squel').useFlavour('postgres');
// var misval = require('./misval'); // not used yet

/*
 * Postgres connection and configuration:
 * 1. If pg-native is installed, will use the (faster) native bindings
 * 2. Find the optimal `poolSize` by running `SHOW max_connections` in postgres
 * 3. Database connection string and table name
 */
var pg = require('pg').native;
pg.defaults.poolSize = 75;

// TODO: make this configurable
var connectionString = 'postgres://jiska:postgres@localhost/jiska';
var databaseTable = 'buurt';

var columnToName = {1: 'a', 2: 'b', 3: 'c', 4: 'd'};
var nameToColumn = {'a': 1, 'b': 2, 'c': 3, 'd': 4};

var aggregateToName = {0: 'aa', 1: 'bb', 2: 'cc', 3: 'dd', e: 'ee'};

/* *****************************************************
 * SQL construction functions
 ******************************************************/

/**
 * Construct an expression for the 'WHERE' clause to filter invalid data
 * Data is considered valid if it is not equal to one of the `facet.misval`,
 * where 'null' is converted to `IS NOT NULL`
 * The type of the misval should match that of the facet.
 * @function
 * @params {Facet} facet
 * @return {Squel.expr} expression
 */
function whereValid (facet) {
  var query = squel.expr();
  if (!facet) {
    return query;
  }

  var accessor = facet.accessor;
  facet.misval.forEach(function (val) {
    if (val === null) {
      query.and(accessor + ' IS NOT NULL');
    } else {
      if (facet.isCategorial) {
        var value = val;
        value = value.replace(/'/g, "''");

        // string valued facet
        query.and(accessor + " != '" + value + "'");
      } else if (facet.isContinuous) {
        // nummeric valued facet
        if ((val && val === +val) || val === 0) {
          // misval can be parsed as number
          query.and(accessor + ' != ' + (+val));
        } else {
          console.log('Non-nummeric missing value for isContinuous facet');
        }
      } else if (facet.isTimeOrDuration) {
        // TODO
        return '';
      } else {
        console.error('Invalid facet in whereValid', facet.toJSON());
      }
    }
  });
  return query;
}

/**
 * Construct an expression for the 'WHERE' clause to filter unselected data
 * @params {Dataset} dataset
 * @params {Filter} filter
 * @returns {Squel.expr} expression
 */
function whereSelected (dataset, filter) {
  var where = squel.expr();

  filter.partitions.forEach(function (partition) {
    // get SQL column name
    var facet = dataset.facets.get(partition.facetId);
    var accessor = facet.accessor;

    if (partition.type === 'categorial') {
      // what groups are selected?
      var targetGroups = [];
      partition.groups.forEach(function (group) {
        if (group.isSelected) {
          targetGroups.push(group.value);
        }
      });

      if (facet.categorialTransform.length > 0) {
        var rules = {};

        // what rules gave those groups?
        targetGroups.forEach(function (group) {
          facet.categorialTransform.forEach(function (rule) {
            // TODO / FIXME: the 'Other' group would be the negative of all rules...?
            // add the rule to our rule list
            rules[rule.expression] = true;
          });
        });

        // create where clause for each rule used
        Object.keys(rules).forEach(function (rule) {
          var expression = rule;
          expression = expression.replace(/'/g, "''");

          if (expression.match('%')) {
            // regexp matching
            expression = " LIKE '" + expression + "'";
          } else {
            // direct comparison
            expression = " ='" + expression + "'";
          }
          where.or(accessor + expression);
        });
      } else {
        // no categorialTransfrom
        targetGroups.forEach(function (group) {
          // create where clause for each selected group
          var esc = group.replace(/'/g, "''");
          where.or(accessor + " = '" + esc + "'");
        });
      }
    } else if (partition.type === 'continuous') {
      if (partition.selected.length > 0) {
        where.and(accessor + '>=' + partition.selected[0]);
        where.and(accessor + '<=' + partition.selected[1]); // FIXME: check edges, only lower bound is inclusive?
      } else {
        where.and(accessor + '>=' + partition.minval);
        where.and(accessor + '<=' + partition.maxval);
      }
    } else if (partition.type === 'datetime') {
      // time
      console.warn('TODO: filterWhereClaus not implemented yet');
    }
  });
  return where;
}

/**
 * Create the SQL query part for a Continuous facet
 * NOTE: data is labeled by group index
 *
 * @function
 * @params {Facet } facet an isContinuous facet
 * @returns {string} query
 */
function selectFieldContinuous (partition, facet) {
  // TODO: Use width_bucket for Postgresql 9.5 or later
  // From the docs: return the bucket number to which operand would be assigned given an array listing
  // the lower bounds of the buckets; returns 0 for an input less than the first lower bound;
  // the thresholds array must be sorted, smallest first, or unexpected results will be obtained

  var lowerbounds = [];
  if (facet.continuousTransform.length > 0) {
    // apply continuousTransform
    partition.groups.forEach(function (group, i) {
      lowerbounds[i] = facet.continuousTransform.inverse(group.min);
      lowerbounds[i + 1] = facet.continuousTransform.inverse(group.max);
    });
  } else {
    partition.groups.forEach(function (group, i) {
      lowerbounds[i] = group.min;
      lowerbounds[i + 1] = group.max;
    });
  }

  var accessor = facet.accessor;
  var query = squel.case();
  var b;

  var i;
  for (i = 0; i < lowerbounds.length - 1; i++) {
    b = squel.expr();
    b.and(accessor + '>' + lowerbounds[i]).and(accessor + '<=' + lowerbounds[i + 1]);
    query.when(b.toString()).then(i + 1);
  }
  query.else(lowerbounds.length);
  return query;
}

/**
 * Create the SQL query part for a categorial facet
 * NOTE: data is labeled by group index
 *
 * @function
 * @params {Facet} facet an isCategorial facet
 * @returns {string} query
 */
function selectFieldCategorial (partition, facet) {
  var query = squel.case();
  var groupToIndex = {};

  // what groups/index are possible?
  partition.groups.forEach(function (group, i) {
    groupToIndex[group.value] = i + 1;
  });

  // what rules gave those groups?
  var rules = {};

  if (facet.categorialTransform.length > 0) {
    // for each selected group
    Object.keys(groupToIndex).forEach(function (group) {
      // check all rules
      facet.categorialTransform.forEach(function (rule) {
        // and add if relevant
        if (rule.group === group) {
          rules[rule.expression] = groupToIndex[group];
        }
      });
    });
  } else {
    // for each selected group
    Object.keys(groupToIndex).forEach(function (group) {
      // add a rule
      rules[group] = groupToIndex[group];
    });
  }

  // create WHEN clause for each rule
  Object.keys(rules).forEach(function (rule) {
    var expression = rule;
    expression = expression.replace(/'/g, "''");

    if (expression.match('%')) {
      // regexp matching
      expression = " LIKE '" + expression + "'";
    } else {
      // direct comparison
      expression = " ='" + expression + "'";
    }
    query.when(facet.accessor + expression).then(rules[rule]);
  });
  query.else(0);

  return query;
}

/**
 * Create the SQL query part for a timeorduration facet
 * NOTE: data is labeled by group index
 *
 * @function
 * @params {Facet} facet an isTimeOrDuration facet
 * @returns {string} query
 */
function selectFieldTimeOrDuration (partition, facet) {
  // TODO
}

/**
 * Create the SQL query part for a facet
 * @function
 * @params {Facet} facet
 * @returns {string} query
 */
function selectField (dataset, partition) {
  var facet = dataset.facets.get(partition.facetId);

  if (!facet) {
    return '1'; // default to the first group
  }

  if (facet.isContinuous) {
    return selectFieldContinuous(partition, facet);
  } else if (facet.isCategorial) {
    return selectFieldCategorial(partition, facet);
  } else if (facet.isTimeOrDuration) {
    return selectFieldTimeOrDuration(partition, facet);
  }
}

/* *****************************************************
 * Database communication functions
 ******************************************************/

/**
 * Perform an database query, and perform callback with the result
 * @function
 * @params{Squel.expr} q
 * @params{function} cb
 */
function queryAndCallBack (q, cb) {
  console.log('Connecting to ' + connectionString + ' and table ' + databaseTable);
  pg.connect(connectionString, function (err, client, done) {
    if (err) {
      return console.error('error fetching client from pool', err);
    }

    client.query(q.toString(), function (err, result) {
      console.log('Querying PostgreSQL:', q.toString());
      done();

      if (err) {
        return console.error('error running query', err);
      }
      cb(result);
    });
  });
}

/* *****************************************************
 * spot-server callbacks
 ******************************************************/

function setPercentiles (dataset, facet) {
  // NOTE: requiers at least postgres 9.4
  // select unnest(percentile_disc(array[0, 0.25, 0.5, 0.75]) within group (order by aant_inw)) from buurt
  // buurt where aant_inw != -99999998 and aant_inw != -99999997;

  facet.continuousTransform.reset();

  var p = [];
  var i;
  for (i = 0; i < 101; i++) {
    p[i] = i / 100;
  }
  var valid = whereValid(facet).toString();
  var query = 'SELECT unnest(percentile_cont(array[' + p.toString() + ']) WITHIN GROUP (ORDER BY ';
  query += facet.accessor + ')) FROM ' + databaseTable;
  if (valid.length > 0) {
    query += ' WHERE ' + valid;
  }

  queryAndCallBack(query, function (data) {
    data.rows.forEach(function (row, i) {
      var prevX = null;
      var nrules = facet.continuousTransform.length;
      if (nrules > 0) {
        prevX = facet.continuousTransform.models[nrules - 1].x;
      }

      var x = row.unnest;
      if (x === +x && x !== prevX) {
        facet.continuousTransform.add({
          x: x,
          fx: p[i] * 100
        });
      }
    });
    facet.transformType = 'percentiles';
    io.syncFacets(dataset);
  });
}

function setExceedances (dataset, facet) {
  // TODO
  console.warn('setExceedances() not implemented for sql datasets');
  facet.transformType = 'percentiles';
  io.syncFacets(dataset);
}

/**
 * Sets minimum and maximum value on a facet
 * NOTE: assumes continuousTransform is a monotonically increasing function
 * @function
 * @params {Dataset} Dataset
 * @params {Facet} facet
 */
function setMinMax (dataset, facet) {
  var query = squel.select()
    .from(databaseTable)
    .field('MIN(' + facet.accessor + ')', 'min')
    .field('MAX(' + facet.accessor + ')', 'max')
    .where(whereValid(facet).toString());

  queryAndCallBack(query, function (result) {
    facet.minvalAsText = result.rows[0].min.toString();
    facet.maxvalAsText = result.rows[0].max.toString();

    io.syncFacets(dataset);
  });
}

/**
 * setCategories finds finds all values on an ordinal (categorial) axis
 * Updates the categorialTransform of the facet
 *
 * @param {Dataset} dataset
 * @param {Facet} facet
 */
function setCategories (dataset, facet) {
  var query;

  // select and add results to the facet's cateogorialTransform
  query = squel
    .select()
    .field(facet.accessor, 'value')
    .field('COUNT(*)', 'count')
    .where(whereValid(facet))
    .from(databaseTable)
    .group('value')
    .order('count', false)
    .limit(50); // FIXME

  queryAndCallBack(query, function (result) {
    var rows = result.rows;

    rows.forEach(function (row) {
      facet.categorialTransform.add({
        expression: row.value,
        count: parseFloat(row.count),
        group: row.value
      });
    });
    io.syncFacets(dataset);
  });
}

/**
 * Scan dataset and create Facets
 * when done, send new facets to client.
 *
 * Identification of column (facet) type is done by querying the postgres metadata
 * dataTypeID: 1700,         numeric
 * dataTypeID: 20, 21, 23,   integers
 * dataTypeID: 700, 701,     float8
 *
 * @function
 */
function scanData (dataset) {
  var query = squel.select().distinct().from(databaseTable).limit(50);

  queryAndCallBack(query, function (data) {
    // remove previous facets
    dataset.facets.reset();

    data.fields.forEach(function (field) {
      var type;
      var SQLtype = field.dataTypeID;
      if (SQLtype === 1700 || SQLtype === 20 || SQLtype === 21 || SQLtype === 23 || SQLtype === 700 || SQLtype === 701) {
        type = 'continuous';
      } else if (SQLtype === 17) {
        // ignore:
        // 17: wkb_geometry
        return;
      } else {
        type = 'categorial';
      }
      // TODO: guess missing data indicators

      var sample = [];
      data.rows.forEach(function (row) {
        if (sample.length < 6 && sample.indexOf(row[field.name]) === -1) {
          sample.push(row[field.name]);
        }
      });

      dataset.facets.add({
        name: field.name,
        accessor: field.name,
        type: type,
        description: sample.join(', ')
      });
    });

    // send facets to client
    io.syncFacets(dataset);
  });
}

/**
 * Get data for a filter
 * @params {Dataset} dataset
 * @params {Filter} filter
 */
function getData (dataset, filter) {
  var query = squel.select().from(databaseTable);

  filter.partitions.forEach(function (partition) {
    var facet = dataset.facets.get(partition.facetId);
    var columnName = columnToName[partition.rank];
    query
      .field(selectField(dataset, partition), columnName)
      .where(whereValid(facet))
      .group(columnName);
  });

  if (filter.aggregates.length > 0) {
    filter.aggregates.forEach(function (aggregate, i) {
      var facet = dataset.filters.get(filter.aggregate.filterId);
      query
        .field(filter.aggregate.operation + '(' + facet.accessor + ')', aggregateToName[i])
        .where(whereValid(facet));
    });
  } else {
    query
      .field('COUNT(*)', aggregateToName[0]);
  }

  // Apply selections from all other filters
  dataset.filters.forEach(function (otherFilter) {
    if (otherFilter.partitions.length > 0 && otherFilter.getId() !== filter.getId()) {
      query.where(whereSelected(dataset, otherFilter));
    }
  });

  queryAndCallBack(query, function (result) {
    // Post process
    var rows = result.rows;

    // FIXME
    // sum groups to calculate relative values
    // var fullTotal = 0;
    // var groupTotals = {};
    // rows.forEach(function (row) {
    //   row.aggregate = parseFloat(row.aggregate);
    //   groupTotals[row.a] = groupTotals[row.a] || 0;
    //   groupTotals[row.a] += row.aggregate;
    //   fullTotal += row.aggregate;
    // });

    // Re-format the data
    rows.forEach(function (row) {
      // Replace base-1 group index with label
      Object.keys(row).forEach(function (columnName) {
        if (!nameToColumn[columnName]) {
          return;
        }

        var column = nameToColumn[columnName];
        var partition = filter.partitions.get(column, 'rank');
        var g = row[columnName];

        // maximum value of continuous facets is mapped to ngroups+1.
        var ngroups = partition.groups.length;
        if (g > ngroups) {
          g = ngroups - 2;
        } else {
          g = g - 1;
        }
        if (g > -1) {
          row[columnName] = partition.groups.models[g].value.toString();
        } else {
          row[columnName] = null;
        }
      });
      // // Postprocess TODO / FIXME
      // if (aggregate.normalizePercentage) {
      //  if (partitionB) {
      //    // we have subgroups, normalize wrt. the subgroup
      //    row.c = 100.0 * row.c / groupTotals[row.a];
      //  } else {
      //    // no subgroups, normalize wrt. the full total
      //    row.c = 100.0 * row.c / fullTotal;
      //  } }
    });
    io.sendData(filter, rows);
  });
}

module.exports = {
  scanData: scanData,
  getData: getData,
  setMinMax: setMinMax,
  setCategories: setCategories,
  setPercentiles: setPercentiles,
  setExceedances: setExceedances
};