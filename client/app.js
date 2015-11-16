var app = require('ampersand-app');
var _ = require('lodash');
var $ = require('jquery');
var config = require('clientconfig');
var Router = require('./router');
var MainView = require('./views/main');
var Me = require('./models/me');
var Filters = require('./models/filter-collection');
var Collection = require('ampersand-collection');
var domReady = require('domready');
var dc = require('dc');
var widgetFactory = require('./widget_factory');
var util = require('./util');

// attach our app to `window` so we can
// easily access it from the console.
window.app = app;

// Extends our main app singleton
app.extend({
    me: new Me(),
    filters: new Filters(),
    widgetFactory: widgetFactory,
    widgets: new Collection(),
    bookmarked: new Collection(),
    router: new Router(),
    math: require('mathjs'),

    // This is where it all starts
    init: function() {
        // Create and attach our main view
        this.mainView = new MainView({
            model: this.me,
            el: document.body
        });

        // Global value for animation speed (0 == off)
        window.anim_speed = 500;

        // this kicks off our backbutton tracking (browser history)
        // and will cause the first matching handler in the router
        // to fire.
        this.router.history.start({ pushState: true });

        // Load the filters
        this.filters.fetch();
        this.filters.sort();

        // Load the actual data, and add it to the crossfilter when ready
        $.ajax({url: 'data/data.json',
            success: function(data) {
                // precalculate the full range of each dimension
                app.filters.forEach(function (f) {
                    f.accessor = f.id.toLowerCase(); // FIXME
                });
                window.app.crossfilter = dc.crossfilter(data);

                var preselect = ['GREEN', 'URBAN', 'UHI50P', 'UHI95P'];
                for (var i in preselect) {
                    app.filters.get(preselect[i]).active = true;
                }
            },
        });

    },
    // This is a helper for navigating around the app.
    // this gets called by a global click handler that handles
    // all the <a> tags in the app.
    // it expects a url pathname for example: "/costello/settings"
    navigate: function(page) {
        var url = (page.charAt(0) === '/') ? page.slice(1) : page;
        this.router.history.navigate(url, {
            trigger: true
        });
    }
});

// run it on domReady
domReady(_.bind(app.init, app));