var View = require('ampersand-view');
var facetSelector = require('./facetselector.js');
var util = require('../util');
var templates = require('../templates');
var app = require('ampersand-app');
var dc = require('dc');


module.exports = View.extend({
    template: templates.includes.widgetframe,
    initialize: function (options) {
        this.collection = app.filters;
        this.once('remove', this.cleanup, this);
    },
    bindings: {
        'model.title': {
            type: 'value',
            hook: 'title-input',
        },
        'model.subtitle': {
            type: 'value',
            hook: 'subtitle-input',
        },
        'model._has_secondary': {
                type: 'toggle',
                hook: 'subtitle',
        },
        // link up mdl javascript behaviour on the page
        'model._title_id' : [
            { type: 'attribute', hook: 'title-input', name: 'id', },
            { type: 'attribute', hook: 'title-label', name: 'for', }
        ],
        'model._subtitle_id' : [
            { type: 'attribute', hook: 'subtitle-input', name: 'id', },
            { type: 'attribute', hook: 'subtitle-label', name: 'for', }
        ],
    },
    events: {
        'click [data-hook~="close"]': 'closeWidget',

        'change [data-hook~="title-input"]': 'changeTitle',
        'change [data-hook~="subtitle-input"]': 'changeSubtitle',
    },
    closeWidget: function () {
        // Remove the widget from the widget collection that is maintained by the parent view
        this.parent.collection.remove(this.model);

        // Remove the view from the dom
        this.remove();
    },
    changePrimary:  function (newPrimary) {
        this.model.primary = newPrimary.id;
        this.model.title = newPrimary.name;

        util.disposeFilterAndGroup(this.widget._fg1);
        this.widget._fg1 = util.facetFilterAndGroup(newPrimary.id);

        // propagate change to widget-content
        this.widget.changedPrimary.call(this);

        // mdl: generate an input event to sync label and input elements
        // note that we are binding to 'change' events, so we are not
        //      creating a short-circuit.
        this.queryByHook('title-input').dispatchEvent(new Event('input'));
    },
    changeSecondary: function (newSecondary) {
        this.model.secondary = newSecondary.id;
        this.model.subtitle = newSecondary.name;

        util.disposeFilterAndGroup(this.widget._fg2);
        this.widget._fg2 = util.facetFilterAndGroup(newSecondary.id);

        // propagate change to widget-content
        this.widget.changedSecondary.call(this);

        // mdl: generate an input event to sync label and input elements
        // note that we are binding to 'change' events, so we are not
        //      creating a short-circuit.
        this.queryByHook('subtitle-input').dispatchEvent(new Event('input'));
    },
    changeTertiary: function (newTertiary) {
        this.model.tertiary = newTertiary.id;

        util.disposeFilterAndGroup(this._fg3);
        this._fg3 = util.facetFilterAndGroup(newTertiary.id);

        // propakgate change to widget-content
        this.widget.changedTertiary.call(this);
    },
    changeTitle: function (e) {
        this.model.title = this.queryByHook('title-input').value;
    },
    changeSubtitle: function (e) {
        this.model.subtitle = this.queryByHook('subtitle-input').value;
    },
    renderContent: function () {
        // Propagate to subview
        this.widget.renderContent.call(this.widget);
    },
    cleanup: function() {
        // Called when this view is 'removed'
        util.disposeFilterAndGroup(this._fg1);
        util.disposeFilterAndGroup(this._fg2);
        util.disposeFilterAndGroup(this._fg3);
    },
    subviews: {
        widget: {
            hook: 'widget',
            constructor: function(options) {
                var view = options.parent;
                var model = view.model;
                options.type = model.type;
                options.model = model;

                var suboptions = {
                    collection: view.collection,
                };

                // The new view containing the requested widget
                var newview = app.widgetFactory.newView(options.parent.model.type, options);

                // we should add the facet/filter/group object,
                // and draw a selector menu for each facet
                if(model._has_primary) {
                    suboptions.icon = 'swap_horiz';
                    suboptions.callback = view.changePrimary;
                    view.renderSubview(new facetSelector(suboptions), '[data-hook~=primaryfacet]');
                    newview._fg1 = util.facetFilterAndGroup(model.primary);
                }
                if(model._has_secondary) {
                    suboptions.icon = 'swap_vert';
                    suboptions.callback = view.changeSecondary;
                    view.renderSubview(new facetSelector(suboptions), '[data-hook~=secondaryfacet]');
                    newview._fg2 = util.facetFilterAndGroup(model.secondary);
                }
                if(model._has_tertiary) {
                    suboptions.icon = 'format_color_fill',
                    suboptions.callback = view.changeTertiary;
                    view.renderSubview(new facetSelector(suboptions), '[data-hook~=tertiaryfacet]');
                    newview._fg3 = util.facetFilterAndGroup(model.tertiary);
                }

                return newview;
            },
        },
    },
});