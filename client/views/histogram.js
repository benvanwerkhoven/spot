var View = require('ampersand-view');
var templates = require('../templates');
var dc = require('dc');
var d3 = require('d3');

module.exports = View.extend({
    template: templates.includes.histogram,
    bindings: {
        'model.filter': '[data-hook~=blank]',
        'model.missing': '[data-hook~=missing]',
        'model.filtermin': '[data-hook~=fmin]',
        'model.filtermax': '[data-hook~=fmax]',
    },
    initialize: function() {
        var self = this;

        // re-render when a different filter is selected
        this.model.on( 'change:filter', function() {self.cleanup(); self.render();} );

        // when the view is removed, also do our own cleanup
        this.once('remove',this.cleanup, this);
    },
    cleanup: function () {
        if( this.model.chart ) {
            // remove filter
            this.model.chart.filterAll();

            // re-render other plots
            dc.renderAll();
        }
    },
    render: function() {
        this.renderWithTemplate(this);

        if(this.model.filter) {

            var idx = this.model.filter.get('id').toLowerCase(); // FIXME: data keys are lowercase
            var _dx = this.model.filter.get('_dx');
            var group = _dx.group();

            // Deal with missing data (set to Infinity):
            // get the (sorted) groupings (key, value), where the last element, [lenght-1],
            // counts the number of missing data points, if any.
            var all = group.all();
            var min = all[0].key;
            var max;
            if( all[all.length-1].key == Infinity ) {
                max  = all[all.length - 2].key;
                this.model.missing = all[all.length-1].value;
            }
            else {
                max = all[all.length - 1].key;
                this.model.missing = 0;
            }

            // Options:
            // mouseZoomable : does not work well in comibination when using a trackpad
            // elasticX : when set to true, and the data contains Infinity, goes bonkers.

            var self = this; // needed for renderlet callback to update model
            var chart = dc.barChart(this.queryByHook('barchart'));
            chart
                .width(250)
                .height(250)
                .brushOn(true)
                .mouseZoomable(false)
                .elasticX(false)
                .elasticY(true)
                .yAxisLabel("This is the Y Axis!")
                .dimension(_dx)
                .group(_dx.group())
                .x(d3.scale.linear().domain([min,max]))
                .transitionDuration(0)
                .on('renderlet', function(chart) {
                    if( chart.hasFilter() ) {

                        // get the active (and only) filter and update the model
                        var range = chart.filters()[0];
                       
                        self.model.filtermin = range[0];
                        self.model.filtermax = range[1];
                    }
                });
            chart.render();
            this.model.chart = chart;
        }
    },
});


