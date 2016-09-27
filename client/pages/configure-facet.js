var PageView = require('./base');
var templates = require('../templates');

var FacetDefineView = require('../views/facet-define');

var FacetTransformContinuousView = require('../views/facet-transform-continuous');
var FacetTransformCategorialView = require('../views/facet-transform-categorial');
var FacetTransformTimeView = require('../views/facet-transform-time');

module.exports = PageView.extend({
  pageTitle: 'Configure Facet',
  template: templates.pages.configureFacet,
  bindings: {
    'model.name': {
      type: 'text',
      hook: 'navbar-facet-name'
    },
    'model.isCategorial': {
      hook: 'transform-categorial-panel',
      type: 'toggle'
    },
    'model.isContinuous': {
      hook: 'transform-continuous-panel',
      type: 'toggle'
    },
    'model.isTimeOrDuration': {
      hook: 'transform-time-panel',
      type: 'toggle'
    }
  },
  subviews: {
    facetDefine: {
      hook: 'facet-define',
      prepareView: function (el) {
        return new FacetDefineView({
          el: el,
          model: this.model
        });
      }
    },

    transformContinuous: {
      hook: 'facet-transform-continuous',
      prepareView: function (el) {
        return new FacetTransformContinuousView({
          el: el,
          model: this.model.continuousTransform
        });
      }
    },
    transformCategorial: {
      hook: 'facet-transform-categorial',
      prepareView: function (el) {
        return new FacetTransformCategorialView({
          el: el,
          model: this.model.categorialTransform
        });
      }
    },
    transformTime: {
      hook: 'facet-transform-time',
      prepareView: function (el) {
        return new FacetTransformTimeView({
          el: el,
          model: this.model.timeTransform
        });
      }
    }
  }
});