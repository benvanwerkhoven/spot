/**
 * A filter provides a chart with an interface to the data.
 * The filter contains a number of `Partition`s and `Aggregate`s.
 * It takes care of calling the relevant functions provided by a `Dataset`.
 *
 * Basic usage for a Chart is:
 * 1. The chart renders using `Filter.data` if available
 * 2. It can add or remove partitions and aggregates to the filter
 * 3. It calls `Filter.updateSelection(..)` when the user makes a selection
 * 4. To apply the new selection, and also filter the other charts, the chart calls `Filter.updateDataFilter()`
 * 5. The charts redraws on 'newData' events on the filter
 *
 * The filter does the following:
 * 1. It adds or removes paritions and aggregates on request
 * 2. When it has the right number of partitions and aggregates, `Filter.isConfigured` becomes true
 *    and `Filter.initDataFilter()` is called
 * 3. This in turn creates a `Filter.getData` function
 * 4. As the new filter could affect all plots `Dataset.getAllData` called
 *
 * `Filter.getData` does the following:
 * 1. It arranges for the `Filter.data` array to be filled
 * 2. A `newData` event is triggerd, and the chart's callback function is executed
 *
 * @class Filter
 * @extends Base
 */

/**
 * newData event
 * Indicates new data is available at Filter.data for plotting.
 *
 * @event Filter#newData
 */

/**
 * @typedef {Object} DataRecord - Object holding the plot data, partitions are labelled with a single small letter, aggregates with a double small letter
 * @property {string} DataRecord.a Value of first partition
 * @property {string} DataRecord.b Value of second partition
 * @property {string} DataRecord.c Value of third partition, etc.
 * @property {string} DataRecord.aa Value of first aggregate
 * @property {string} DataRecord.bb Value of second aggregate, etc.
 */

/**
 * @typedef {DataRecord[]} Data - Array of DataRecords
 */

var Base = require('./util/base');
var Aggregates = require('./aggregate/collection');
var Partitions = require('./partition/collection');

module.exports = Base.extend({
  props: {
    /**
     * Hint for the client (website) how to visualize this filter
     * @memberof! Filter
     * @type {string}
     */
    chartType: {
      type: 'string',
      required: true,
      default: 'barchart',
      values: ['piechart', 'horizontalbarchart', 'barchart', 'linechart', 'radarchart', 'polarareachart', 'bubbleplot', 'scatterchart', 'networkchart']
    },
    /**
     * Title for displaying purposes
     * @memberof! Filter
     * @type {string}
     */
    title: ['string', true, ''],
    /**
     * Hint for the client (website) how to position the chart for this filter
     * position (col, row) and size (size_x, size_y) of chart
     */
    col: 'number',
    row: 'number',
    size_x: 'number',
    size_y: 'number'
  },
  collections: {
    /**
     * @memberof! Filter
     * @type {Partitions[]}
     */
    partitions: Partitions,
    /**
     * @memberof! Filter
     * @type {Aggregate[]}
     */
    aggregates: Aggregates
  },
  // Session properties are not typically persisted to the server,
  // and are not returned by calls to toJSON() or serialize().
  session: {
    /*
     * Minimum number of partitions required
     * @memberof! Chart
     * @type {number}
     */
    minPartitions: 'number',

    /*
     * Maximum number of partitions required
     * @memberof! Chart
     * @type {number}
     */
    maxPartitions: 'number',

    /**
     * Array containing the data to plot
     * @memberof! Filter
     * @type {Data}
     */
    data: {
      type: 'array',
      default: function () {
        return [];
      }
    },

    /**
     * Call this function to request new data.
     * The dataset backing the facet will copy the data to Filter.data.
     * A newData event is fired when the data is ready to be plotted.
     * @function
     * @virtual
     * @memberof! Filter
     * @emits newData
     */
    getData: {
      type: 'any',
      default: null
    },

    /**
     * A history of the current drill-down (ie. partitions.toJSON())
     */
    zoomHistory: {
      type: 'array',
      default: function () {
        return [];
      }
    }
  },
  derived: {
    isConfigured: {
      deps: ['minPartitions', 'maxPartitions', 'partitions'],
      cache: false,
      fn: function () {
        var p = this.partitions.length;

        return (this.minPartitions <= p && p <= this.maxPartitions);
      }
    }
  },
  // Initialize the Filter:
  // * set up callback to free internal state on remove
  initialize: function () {
    this.partitions.on('change', function (partition, options) {
      if (this.isConfigured) {
        if (partition.type !== 'categorial') {
          partition.setGroups();
        }
        this.initDataFilter();
      } else {
        this.releaseDataFilter();
      }
    }, this);

    this.partitions.on('add', function (partition, partitions, options) {
      partition.reset({ silent: true });
      partition.setGroups();
      if (this.isConfigured) {
        this.initDataFilter();
      }
    }, this);

    this.partitions.on('remove', function () {
      this.releaseDataFilter();
      if (this.isConfigured) {
        this.initDataFilter();
      } else {
        this.data = [];
        this.trigger('newData');
      }
    }, this);

    this.aggregates.on('add remove', function (aggregate, aggregates, options) {
      this.releaseDataFilter();
      if (this.isConfigured) {
        this.initDataFilter();
      } else {
        this.data = [];
        this.trigger('newData');
      }
    }, this);

    this.on('remove', function () {
      this.releaseDataFilter();
    });
  },
  zoomIn: function () {
    // save current state
    this.zoomHistory.push(JSON.stringify(this.partitions.toJSON()));

    this.partitions.forEach(function (partition) {
      if ((partition.selected.length === 2) && (partition.isDatetime || partition.isContinuous)) {
        if (partition.groupFixedS || partition.groupFixedSC) {
          // scale down binsize
          var newSize = partition.selected[1] - partition.selected[0];
          var oldSize = partition.maxval - partition.minval;
          partition.groupingParam = partition.groupingParam * newSize / oldSize;
        }
        // zoom to selected range, if possible
        partition.set({
          minval: partition.selected[0],
          maxval: partition.selected[1]
        }, { silent: true });
        partition.setGroups();
      } else if (partition.selected.length > 0 && (partition.isCategorial)) {
        // zoom to selected categories, if possible
        partition.groups.reset();
        partition.selected.forEach(function (value) {
          partition.groups.add({
            value: value,
            label: value,
            count: 0,
            isSelected: true
          });
        });
      }
      // select all
      partition.updateSelection();
    });
    this.initDataFilter();
  },
  zoomOut: function () {
    var doReset = true;

    // clear current selection
    this.partitions.forEach(function (partition) {
      if (partition.selected.length > 0) {
        partition.updateSelection();
        doReset = false;
      }
    });

    if (doReset) {
      if (this.zoomHistory.length > 0) {
        // nothing was selected and we have drilled down: go up
        var state = JSON.parse(this.zoomHistory.pop());
        this.partitions.reset(state);
      } else {
        // nothing was selected and no drill down: reset partitioning
        this.partitions.forEach(function (partition) {
          if (partition.isDatetime || partition.isContinuous) {
            partition.reset({ silent: true });
          }
          partition.setGroups();
        });
      }
    }
    this.initDataFilter();
  },
  // Apply the separate filterFunctions from each partition in a single function
  filterFunction: function () {
    var fs = [];
    this.partitions.forEach(function (partition) {
      fs.push(partition.filterFunction());
    });
    return function (d) {
      if (typeof d === 'string') {
        var groups = d.split('|');
        return fs.every(function (f, i) { return f(groups[i]); });
      } else {
        // shortcut for non-partitioned numeric data
        return fs[0](d);
      }
    };
  },
  /**
   * Initialize the data filter, and construct the getData callback function on the filter.
   */
  initDataFilter: function () {
    var dataset = this.collection.parent;

    dataset.releaseDataFilter(this);
    dataset.initDataFilter(this);
    dataset.updateDataFilter(this);
    dataset.getAllData();
  },
  /**
   * The opposite or initDataFilter, it should remove the filter and deallocate other configuration
   * related to the filter.
   */
  releaseDataFilter: function () {
    var dataset = this.collection.parent;

    dataset.releaseDataFilter(this);
    dataset.getAllData();
  },
  /**
   * Change the filter parameters for an initialized filter
   */
  updateDataFilter: function () {
    var dataset = this.collection.parent;

    dataset.updateDataFilter(this);
    dataset.getAllData();
  }
});
