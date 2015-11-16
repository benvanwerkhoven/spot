var app = require('ampersand-app');
var widgetCollection = require('./models/widget-collection');

var table = {};

var registeredWidgets = new widgetCollection();

var newModel = function(options) {
    var w = table[ options.type ];
    return new w.newModel(options);
};

var newView = function(type,options) {
    var w = table[ type ];
    return new w.newView(options);
};

var registerWidget = function(type, modelConstructor, viewConstructor) {
    table[ type ] = {
        'newModel' : modelConstructor,
        'newView' : viewConstructor,
    }; 
    registeredWidgets.add( { 'type': type, } );
};


// Register the widgets here
registerWidget( "barchart", require('./models/barchart.js'), require('./views/barchart.js') );
registerWidget( "heatmap", require('./models/heatmap.js'), require('./views/heatmap.js') );
registerWidget( "correlation", require('./models/correlation.js'), require('./views/correlation.js') );
registerWidget( "piechart", require('./models/piechart.js'), require('./views/piechart.js') );
registerWidget( "datatable", require('./models/datatable.js'), require('./views/datatable.js') );
registerWidget( "scatterplot", require('./models/scatterplot.js'), require('./views/scatterplot.js') );

module.exports = {
    'widgets': registeredWidgets,
    'registerWidget': registerWidget,
    'newModel': newModel,
    'newView':  newView,
};
