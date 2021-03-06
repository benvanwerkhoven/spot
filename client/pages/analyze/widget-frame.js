var View = require('ampersand-view');
var templates = require('../../templates');
var app = require('ampersand-app');
var SlotView = require('./slot');
var $ = require('jquery');

// NOTE: gridster does not work properly with require()
// workaround via browserify-shim (configured in package.json)
require('gridster');

function removeWidget (view, filter) {
  // Remove the filter from the dataset
  var filters = filter.collection;
  filters.remove(filter);

  // Remove gridster stuff
  var gridster = $('[id~=widgets]').gridster().data('gridster');
  gridster.remove_widget(view.gridsterHook);

  // Remove ampersand stuff
  var p = view.parent._subviews;
  p.splice(p.indexOf(view), 1);
  view.remove();
}

module.exports = View.extend({
  template: templates.analyze.widgetFrame,
  initialize: function (opts) {
    this.editMode = app.editMode;
    app.on('editMode', function () {
      this.editMode = app.editMode;
    }, this);

    var filter = this.model;

    // Create a model for the chosen chart
    this.model = app.widgetFactory.newModel({
      modelType: filter.chartType,
      filter: filter,
      filterId: filter.id
    });

    // displayed in config mode
    this.widgetHeader = filter.chartType;

    // inform the filter on the number of partitions and aggregates
    filter.minPartitions = this.model.minPartitions;
    filter.maxPartitions = this.model.maxPartitions;

    if (filter.isConfigured) {
      filter.initDataFilter();
    }
  },
  props: {
    chartType: 'string'
  },
  derived: {
    'showMenu': {
      deps: ['editMode', 'mouseOver'],
      fn: function () {
        // never show in edit mode
        if (this.editMode) return false;

        // http://stackoverflow.com/questions/4817029/whats-the-best-way-to-detect-a-touch-screen-device-using-javascript/4819886#4819886
        var touch = 'ontouchstart' in window || navigator.maxTouchPoints;
        return touch || this.mouseOver;
      }
    }
  },
  session: {
    editMode: 'boolean',
    mouseOver: ['boolean', true, false]
  },
  bindings: {
    'editMode': {
      hook: 'config-view',
      type: 'toggle',
      invert: false
    },
    'showMenu': {
      type: 'toggle',
      hook: 'plot-menu'
    },
    'widgetHeader': {
      hook: 'widgetHeader',
      type: 'text'
    }
  },
  events: {
    'click [data-hook~="close"]': 'closeWidget',
    'click [data-hook~="zoom-in"]': 'zoomIn',
    'click [data-hook~="zoom-out"]': 'zoomOut',

    'mouseenter .widgetFrame': 'mouseEnter',
    'mouseleave .widgetFrame': 'mouseLeave'
  },
  zoomIn: function (ev) {
    this.model.filter.zoomIn();
  },
  zoomOut: function () {
    this.model.filter.zoomOut();
  },
  mouseEnter: function () {
    this.mouseOver = true;
  },
  mouseLeave: function () {
    this.mouseOver = false;
  },
  closeWidget: function () {
    removeWidget(this, this.model.filter);
  },
  render: function () {
    this.renderWithTemplate(this);
    this.renderCollection(this.model.slots, SlotView, this.queryByHook('slots'));
    return this;
  },
  renderContent: function () {
    // Propagate to subview
    this.widget.renderContent();
  },
  subviews: {
    widget: {
      hook: 'widget',
      constructor: function (options) {
        options.model = options.parent.model; // NOTE: type is determined from options.model.modelType
        return app.viewFactory.newView(options);
      }
    }
  }
});
