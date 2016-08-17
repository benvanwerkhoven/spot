var View = require('ampersand-view');
var templates = require('../templates');
var app = require('ampersand-app');

module.exports = View.extend({
  template: templates.includes.partitionContinuous,
  derived: {
    show: {
      deps: ['model.facetId'],
      fn: function () {
        var facet = app.me.dataset.facets.get(this.model.facetId);
        return facet.displayContinuous;
      }
    },
    minvalAsText: {
      deps: ['model.minval'],
      fn: function () {
        return this.model.minval.toString();
      }
    },
    maxvalAsText: {
      deps: ['model.maxval'],
      fn: function () {
        return this.model.maxval.toString();
      }
    }
  },
  bindings: {
    'show': {
      type: 'toggle',
      hook: 'group-continuous-panel'
    },

    'model.minval': {
      type: 'value',
      hook: 'group-minimum-input'
    },
    'model.maxval': {
      type: 'value',
      hook: 'group-maximum-input'
    },
    'model.groupingParam': {
      type: 'value',
      hook: 'group-param-input'
    },
    'model.groupFixedN': {
      type: 'booleanAttribute',
      hook: 'group-fixedn-input',
      name: 'checked'
    },
    'model.groupFixedSC': {
      type: 'booleanAttribute',
      hook: 'group-fixedsc-input',
      name: 'checked'
    },
    'model.groupFixedS': {
      type: 'booleanAttribute',
      hook: 'group-fixeds-input',
      name: 'checked'
    },
    'model.groupLog': {
      type: 'booleanAttribute',
      hook: 'group-log-input',
      name: 'checked'
    }
  },
  events: {
    'change [data-hook~=group-minimum-input]': function () {
      this.model.minval = parseInt(this.queryByHook('group-minimum-input').value);
    },
    'change [data-hook~=group-maximum-input]': function () {
      this.model.maxval = parseInt(this.queryByHook('group-maximum-input').value);
    },
    'click [data-hook~=group-range-button]': function () {
      var partition = this.model;

      var facet = app.me.dataset.facets.get(partition.facetId);
      partition.minval = facet.minval;
      partition.maxval = facet.maxval;

      partition.groups.reset();
      this.queryByHook('group-minimum-input').dispatchEvent(new window.Event('input'));
      this.queryByHook('group-maximum-input').dispatchEvent(new window.Event('input'));
      // FIXME: wrong animation when no values in input
    },

    'change [data-hook~=group-param-input]': function () {
      this.model.groupingParam = parseInt(this.queryByHook('group-param-input').value);
    },
    'click [data-hook~=group-fixedn-input]': function () {
      this.model.groupingContinuous = 'fixedn';
    },
    'click [data-hook~=group-fixedsc-input]': function () {
      this.model.groupingContinuous = 'fixedsc';
    },
    'click [data-hook~=group-fixeds-input]': function () {
      this.model.groupingContinuous = 'fixeds';
    },
    'click [data-hook~=group-log-input]': function () {
      this.model.groupingContinuous = 'log';
    }
  }
});