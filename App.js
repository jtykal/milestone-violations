Ext.define('MilestoneApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    items: [
      {xtype:'container', itemId: 'display_box'}
    ],

    config: {
        defaultSettings: {
          query: ''
        }
    },

    launch: function() {
      this._loadMilestones();
      this._loadPortfolioItems();
//      window.map = this;
    },

    _loadMilestones: function() {
        Ext.create('Rally.data.WsapiDataStore', {
            autoLoad : true,
            limit : "Infinity",
            model : "Milestone",
            fetch : ["Name", "TargetDate"],
            listeners : {
                scope : this,
                load : function(store, data) {
                    this.milestones = store;
                    if(this.pfstore) this._onDataReady();
                }
            }
        });
    },

//    _loadPortfolioItemTypes: function() {
      //Usually PortfolioItem/Feature, but the name
      //could be changed in workspace so we need to 
      //dynamically determine lowest level
//       var self = this;
//       Ext.create('Rally.data.wsapi.Store', {
//        model: 'TypeDefinition',
//        autoLoad:true,
//        filters: [{
//            property: "TypePath",
//            operator: "contains",
//            value: "PortfolioItem/"
//        }],
//        listeners: {
//            load: function(store, data, success) { 
//              self._loadPortfolioItems(data[0].data.TypePath);
//            }
//        }
//      });
//    },

    onTimeboxScopeChange: function(newTimeboxScope) {
      this.callParent(arguments);
      this.launch();
    },

    _getFilters: function() {
      var filter = Ext.create('Rally.data.wsapi.Filter', {
        property: 'Milestones.ObjectID',
        operator: "!=",
        value: null
      });

      var timeboxScope = this.getContext().getTimeboxScope();
      if (timeboxScope) {
        if (timeboxScope.getType().toLowerCase() === "milestone") {
          var timebox = timeboxScope.getRecord();
          if (timebox) {
            //console.log('milestone is: ', timebox);
            var timebox_filter = Ext.create('Rally.data.wsapi.Filter', {
              property: 'Milestones.Name',
              operator: "=",
              value: timebox.data.Name
            });
            //console.log('timebox_filter is: ',timebox_filter, timebox_filter.toString());
            filter = filter.and(timebox_filter);
          }
        }
      }

      if (this.getSetting('query')) {
        var querySetting = this.getSetting('query').replace(/\{user\}/g, this.getContext().getUser()._ref);
        var query_filter = Rally.data.QueryFilter.fromQueryString(querySetting);
        //console.log('query filter is: ', query_filter, query_filter.toString());
        filter = filter.and(query_filter);
      }

      //console.log('_getFilters() returns: ', filter, filter.toString());
      return filter;
    },

    _loadPortfolioItems: function() {
      Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: ["PortfolioItem/Feature"],
            autoLoad: true,  
            enableHierarchy: false,
            context: null,
            sortOnLoad: false,
            filters: this._getFilters(),
            listeners: {
                load: this._onDataLoaded,
                scope: this
            }
        }).then({
            success: this._onStoreBuilt.bind(this, "PortfolioItem/Feature"),
            scope: this
        });
    },

    _onDataLoaded: function(store, node, data) {
      this.pfstore = store;
      if(this.milestones) this._onDataReady();
    },

    _onDataReady: function() {
      var self = this;
      //window.pfstore = this.pfstore;
      _.map(this.pfstore.getTopLevelNodes(), function(record) {
        record.self.addField('DaysLate');
        record.self.addField('Milestone');
        record.self.addField('TargetDate');

        var milestone = self._findFirstMilestone(record.get("Milestones"));

        // If page uses a milestone filter, then use that Milestone to define Target Date.
        var timeboxScope = self.getContext().getTimeboxScope();
        if (timeboxScope && (timeboxScope.getType().toLowerCase() === "milestone") && timeboxScope.getRecord()) {
          //console.log('timeboxScope is: ', timeboxScope);
          milestone = timeboxScope.getRecord();
        }

        if (milestone) {
          var plannedEndDate = record.get("PlannedEndDate");
          var targetDate = milestone.data.TargetDate;
          var targetDateString = moment(targetDate).format("YYYY-MM-DD");
          var plannedEndDateString = moment(plannedEndDate).format("YYYY-MM-DD");
          record.set("Milestone", milestone.data.Name);
          record.set("TargetDate", targetDateString);

          var daysLate = moment(plannedEndDate).diff(moment(targetDate), 'days') + 1;

          //show all of the values -- if not late, it will be a negative number. useful for sorting
          if(plannedEndDateString == targetDateString) {
            daysLate = 0;
          }
          //if (daysLate < 0){
          //  daysLate = "ON TIME";  // SCREWS UP THE SORTING
          //}
          record.set("DaysLate", daysLate);
        }
      });
      this.pfstore.sort({property: "DaysLate", direction: "DESC"});
    },
  
    _findFirstMilestone: function(pfmilestones) {
      var refs = _.pluck(pfmilestones._tagsNameArray, "_ref");
      
      var mdata = _.filter(this.milestones.data.items, function(milestone) { 
        return _.contains(refs, milestone.data._ref);
      });
      var sorted = _.sortBy(mdata, function(milestone) {
        return milestone.data.TargetDate;
      });
      return _.first(sorted);
    },

    _onStoreBuilt: function(modelName, store) {
     
        if (this.down('#display_box')) {
          this.down('#display_box').removeAll();
        }

        var modelNames = [modelName],
            context = this.getContext();
      
        store.model.addField({name: "Milestone"});
        store.model.addField({name: "TargetDate"});
        store.model.addField({name: "DaysLate"});
      
          this.gridBoard = this.down('#display_box').add({
            xtype: 'rallygridboard',
            context: context,
            modelNames: modelNames,
            toggleState: 'grid',
            stateful: false,
//            plugins: [
//                {
//                    ptype: 'rallygridboardfieldpicker',
//                    headerPosition: 'right',
//                    modelNames: modelNames,
//                    stateful: true,
//                    stateId: context.getScopedStateId('milestone-app')
//                }
//            ],
            gridConfig: {
                store: store,
                expandAllInColumnHeaderEnabled: true,
                columnCfgs: [
                    'FormattedID',
                    'Name',
                    'Project',
                    'Parent',
                    'Owner',
                    'PlannedEndDate',
                    'Milestones',
                    {
                      text: 'Milestone Target Date',
                      dataIndex: 'TargetDate'
                    },
                    {
                      text: 'Days Late',
                      dataIndex: 'DaysLate'
                    }
                    
                ],
                plugins: [
                {
                  ptype: "rallytreegridexpandedrowpersistence", 
                  enableExpandLoadingMask:false
                }],
                getState: function() {
                  return {};
                },
                applyState: function() {

                }
                
            },
            height: this.getHeight()
          
        });
    },

    getSettingsFields: function(){
      return [
        {
          type: 'query'
        }
      ];
    },

    onSettingsUpdate: function(settings) {
      this.callParent(arguments);
      this.launch();
    }
  
});
