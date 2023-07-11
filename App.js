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
//      this._loadPortfolioItemTypes();
      this._loadPortfolioItems();
      window.map = this;
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
      console.log('timebox scope changed - do a refresh');
      this.callParent(arguments);
      // DO SOMETHING HERE TO CLEAR PREVIOUS LIST!
      this._loadPortfolioItems("PortfolioItem/Feature");
    },

    _getFilters: function() {
      var filter = Ext.create('Rally.data.wsapi.Filter', {
        property: 'Milestones.ObjectID',
        operator: "!=",
        value: null
      });

      var timeboxScope = this.getContext().getTimeboxScope();
      //if (timeboxScope && timeboxScope.isApplicable(this.model)) {
      //if (timeboxScope && _.any(this.models, timeboxScope.isApplicable, timeboxScope)) {
      if (timeboxScope) {

        console.log('timeboxScope is: ', timeboxScope);

        if (timeboxScope.getType() == "milestone") {
          console.log('milestone name is: ', timeboxScope.getInitialConfig().record.data.Name);
          var timebox_filter = Ext.create('Rally.data.wsapi.Filter', {
            property: 'Milestones.Name',
            operator: "=",
            value: timeboxScope.getInitialConfig().record.data.Name
          });
          console.log('timebox_filter is: ',timebox_filter, timebox_filter.toString());
          filter = filter.and(timebox_filter);
        }
      }

      if (this.getSetting('query')) {
        var querySetting = this.getSetting('query').replace(/\{user\}/g, this.getContext().getUser()._ref);
        var query_filter = Rally.data.QueryFilter.fromQueryString(querySetting);
        filter = filter.and(query_filter);
      }

      console.log('filter is: ', filter, filter.toString());
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
        if(milestone) {

          var plannedEndDate = record.get("PlannedEndDate");
          var targetDate = milestone.get("TargetDate");
          // TODO: Date format can be changed in workspace settings 
          // should use same format
          var targetDateString = moment(targetDate).format("YYYY-MM-DD");
          var plannedEndDateString = moment(plannedEndDate).format("YYYY-MM-DD");
          record.set("Milestone", milestone.data.Name);
          record.set("TargetDate", targetDateString);

          var daysLate = moment(plannedEndDate).diff(moment(targetDate), 'days') + 1;

          //show all of the values -- if not late, it will be a negative number. useful for sorting
          if(plannedEndDateString == targetDateString) {
            daysLate = 0;
          }
          record.set("DaysLate", daysLate);

          //TODO: plannedEndDate is just before midnight and results in 
          // daysLate 1 if plannedDate and targetDate are the same.  
          // as workaround just check for that condition explicitly
          //if( daysLate > 0 && plannedEndDateString != targetDateString) {
          //  record.set("DaysLate", daysLate);
          //} else {
            // record.remove() will flag record as removed and delete on server
            // when any other change is made. 
            //pfstore.tree.root.childNodes = _.remove(pfstore.tree.root.childNodes, record);
          //}
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
      
//        this.gridBoard = this.add({
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
                /* START ADD */
                //storeConfig: {
                //  filters: this._getFilters()
                //},
                /* END */
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
                      text: 'Earliest Target Date',
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
    }
  
});
