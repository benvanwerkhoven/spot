var app = require('ampersand-app');
var ContentView = require('./widget-content');
var templates = require('../templates');
var util = require('../util');
var dc = require('dc');
var d3 = require('d3');

module.exports = ContentView.extend({
    template: templates.includes.scatterplot,
    bindings: {
        'model.bincount': {
            type: 'value',
            hook: 'bincount'
        },
    },
    renderContent: function(view) {
        var x = parseInt(0.8 * this.el.offsetWidth);
        var y = parseInt(x);

        // dont do anything without a filter defined
        if(! view.model.isReady) {
            return;
        }

        delete view._chart;

        if(view._dz) {
            view._dz.dispose();
            delete view._dz;            
        }

        // Get the 1-d filters for range setting
        var bincount = view.model.bincount;
        var range;

        var rangex = util.getFGrange(view._fg1);
        var binsizex = (rangex[1] - rangex[0]) / bincount;

        var rangey = util.getFGrange(view._fg2);
        var binsizey = (rangey[1] - rangey[0]) / bincount;

        // Construct new filter
        var xvalFn = view.model.primary.toLowerCase();
        var yvalFn = view.model.secondary.toLowerCase();
        
        var _dz = window.app.crossfilter.dimension(function(d) {
            var binx = Math.round( (view._fg1.valueFn(d) - rangex[0]) / binsizex );
            var biny = Math.round( (view._fg2.valueFn(d) - rangey[0]) / binsizey );
            return [binx * binsizex + rangex[0], biny * binsizey + rangey[0]];
        });

        // Options:
        // mouseZoomable : does not work well in comibination when using a trackpad
        // elasticX : when set to true, and the data contains Infinity, goes bonkers.
        var chart = dc.scatterPlot(this.queryByHook('scatterplot'));
        chart
            .brushOn(true)
            .mouseZoomable(false)
            .elasticX(true)
            .elasticY(true)
            .x(d3.scale.linear())
            .y(d3.scale.linear())
            .transitionDuration(window.anim_speed)
            .dimension(_dz)
            .group(_dz.group().reduceCount())
            .on('filtered', function(chart) {
                if(chart.hasFilter()) {
                    // update the model
                    view.model.range = chart.filters()[0];
                }
                else {
                    view.model.range = undefined;
                }
            });

        // keep a handle on the chart, will be cleaned up by the widget-content base class.
        chart.render();
        view._chart = chart;
        view._dz = _dz;
    },

    // Respond to secondary filter changes
    events: {
        'change [data-hook~=bincount]': 'changeBincount',
    },
    changeBincount:  function () {
        var select = this.el.querySelector('[data-hook~="bincount"]');
        this.model.bincount = parseInt(select.value);

        this.renderContent(this);
    },
    changePrimary: function () {
        util.disposeFilterAndGroup(this._fg1);
        this._fg1 = util.facetFilterAndGroup(this.model.primary);
        this.renderContent(this);
    },
    changeSecondary: function () {
        util.disposeFilterAndGroup(this._fg2);
        this._fg2 = util.facetFilterAndGroup(this.model.secondary);
        this.renderContent(this);
    },
    cleanup: function () {
        util.disposeFilterAndGroup(this._fg1);
        util.disposeFilterAndGroup(this._fg2);
        if(this._dz) {
            this._dz.dispose();
        }
        delete this._dz;            
    },
});
