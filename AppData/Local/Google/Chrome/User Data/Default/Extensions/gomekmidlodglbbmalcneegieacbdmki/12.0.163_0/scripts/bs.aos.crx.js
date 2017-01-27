/*******************************************************************************
 *  avast! browsers extensions
 *  (c) 2012-2014 Avast Corp.
 *
 *******************************************************************************
 *
 *  Background Browser Specific - Core Chrome Extensions functionality
 *
 ******************************************************************************/

(function (_) {


    var bal = null; //AvastWRC.bal instance - browser agnostic

    var hostInTab = [];
    var scriptInTab = [];

    /**
     * User has change from tab to tab or updated an url in the tab
     *
     * @param  {String} url    Site url loaded into the tab
     * @param  {Object} tab    Tab object reference
     * @param  {String} change Status of the tab (loading or undefined)
     * @return {void}
     */
    function urlInfoChange(url, tab, change, tabUpdated) {
        if (AvastWRC.CONFIG.ENABLE_WEBREP_CONTROL) {
            var urlDetails = [url];

            if (tab.id) {
                urlDetails = {
                    url: url,
                    referer: AvastWRC.TabReqCache.get(tab.id, 'referer'),
                    tabNum: tab.id,
                    windowNum: tab.windowId,
                    reqServices: bal.reqUrlInfoServices,
                    tabUpdated: tabUpdated,
                    originHash: AvastWRC.bal.utils.getHash(url + tab.id + tab.windowId),
                    origin: AvastWRC.TabReqCache.get(tab.id, 'origin'),
                    customKeyValue: AvastWRC.Queue.get('pageTitle')
                };
            }

            // perform urlinfo
            AvastWRC.get(urlDetails, function (res) {
                AvastWRC.bal.emitEvent('urlInfo.response', url, res[0], tab, tabUpdated);
            });
        }
        if (tabUpdated && AvastWRC.bal.DNT && AvastWRC.bal.DNT.initTab) {
            AvastWRC.bal.DNT.initTab(tab.id);
        }
    }


    /**
     * User updates URL  in the browser (clicking a link, etc.) Question: why is it also triggered for unloaded tabs
     *
     * @param  {Number} tabId      Tab Identification
     * @param  {Object} changeInfo state of loading {status : "loading | complete", url: "http://..."}  - url property appears only with status == "loading"
     * @param  {Object} tab        Tab properties
     * @return {void}
     */
    function onTabUpdated(tabId, changeInfo, tab) {
    	AvastWRC.bs.tabExists.call(this, tabId, function() {
	        // ignore unsuported tab urls like chrome://, about: and chrome.google.com/webstore - these are banned by google.
	        // and disable the browser extension for those tabs
	        if (!AvastWRC.bs.checkUrl(tab.url)) {	            
	            chrome.browserAction.disable(tabId);
	            return;
	        }
	
	        //enable the browser extension
	        chrome.browserAction.enable(tabId);
	
	        var host = bal.getHostFromUrl(tab.url);
	
	        if (changeInfo.status === 'loading') {
	        	console.log("onTabUpdated() status: " + changeInfo.status);
				AvastWRC.TabReqCache.set(tab.id, 'timer', Date.now());
				
	            urlInfoChange(tab.url, tab, changeInfo.status, true);
	            if (host) {
	                delete scriptInTab[tab.id];
	            }
	        } else if (changeInfo.status === 'complete') {
	        	
	        	var timer = Date.now() - AvastWRC.TabReqCache.get(tab.id, 'timer');
				console.log("onTabUpdated()  status: " + changeInfo.status + " time " +  timer);
				
	            if (hostInTab[tabId] === undefined) {
	                urlInfoChange(tab.url, tab, changeInfo.status, true);
	            }
	            AvastWRC.bal.emitEvent('page.complete', tabId, tab, tab.url);
	        }
	        if (host) {
	            hostInTab[tabId] = host;
	        }
    	});
    }

    /**
     * User changes tab focus
     *
     * @param  {Object} tab        Tab object
     * @param  {Object} changeInfo [description]
     * @return {void}
     */
    function onSelectionChanged(tabId, changeInfo) {
    	AvastWRC.bs.tabExists.call(this, tabId, function() {
	        chrome.tabs.get(tabId, function (tab) {
	            // ignore unsuported tab urls like chrome://, about: and chrome.google.com/webstore - these are banned by google.

	            if (!AvastWRC.bs.checkUrl(tab.url)) {	                
	                chrome.browserAction.disable(tabId);
	                return;
	            }
	            //enable the browser extension
                chrome.browserAction.enable(tabId);
	
	            urlInfoChange(tab.url, tab, changeInfo.status, false);
	        });
    	});
    }

    function onActivated(activeInfo, changeInfo) {
        
    	AvastWRC.bs.tabExists.call(this, activeInfo.tabId, function() {
	        chrome.tabs.get(activeInfo.tabId, function (tab) {
	            // ignore unsuported tab urls like chrome://, about: and chrome.google.com/webstore - these are banned by google.	            
	            if (!AvastWRC.bs.checkUrl(tab.url)) {	                
	                chrome.browserAction.disable(activeInfo.tabId);
	                return;
	            }
	            //enable the browser extension
	            chrome.browserAction.enable(activeInfo.tabId);
	
	            if (typeof changeInfo == "undefined") {
	                changeInfo = {};
	                changeInfo.status = "complete";
	            }
	            urlInfoChange(tab.url, tab, changeInfo.status, false);
	        });
    	});
    }

    function onRedirect(info) {
    	AvastWRC.bs.tabExists.call(this, info.tabId, function(){
	        chrome.tabs.get(info.tabId, function (tab) {
	            // ignore unsuported tab urls like chrome://, about: and chrome.google.com/webstore - these are banned by google.	            
	            if (!AvastWRC.bs.checkUrl(tab.url)) {	                
	                chrome.browserAction.disable(info.tabId);
	                return;
	            }
	            //enable the browser extension
	            chrome.browserAction.enable(info.tabId);
	
	            console.log(info.statusCode + " REDIRECT from " + info.url + " to " + info.redirectUrl);
	
	            urlInfoChange(info.url, tab, null, AvastWRC.gpb.All.EventType.SERVER_REDIRECT);
	        });
    	});
    }

    /**
     * Forwards all the messages to the browser agnostic core
     */
    function messageHub(request, sender, reply) {
        bal.commonMessageHub(request.message, request, sender.tab);
    }

    /**
     * Injects all the needed scripts to a tab and sends a message
     */
    function accessContent(tab, data) {
        if (scriptInTab[tab.id] === undefined) {
            scriptInTab[tab.id] = true;
            var options = {
                tab: tab,
                callback: function () { AvastWRC.bs.messageTab(tab, data); }
            };
            _.extend(options, AvastWRC.bal.getInjectLibs());

            if (AvastWRC.bs.ciuvoASdetector && AvastWRC.bs.ciuvoASdetector.isAffiliateSource(tab.id, true)) {
                console.log("afsrc=1 detected, standing down");
            } else {
                AvastWRC.bs.inject(options);
            }

        }
        else {
            AvastWRC.bs.messageTab(tab, data);
        }
    }


    /*****************************************************************************
     * bs - override the common browser function with ext. specific
     ****************************************************************************/
    _.extend(AvastWRC.bs,
        {
            accessContent: accessContent,

            /**
             * Get host of the tab.
             */
            getHostInTab: function (tabId) {
                return hostInTab[tabId];
            },

            /**
             * Set host of the tab.
             */
            setHostInTab: function (tabId, host) {
                hostInTab[tabId] = host;
            }

        });

    /*****************************************************************************
     * bs.aos - browser specific AOS functionality
     ****************************************************************************/
    AvastWRC.bs.core = AvastWRC.bs.core || {};
    _.extend(AvastWRC.bs.core, // Browser specific
        {
            /**
             * Function called on BAL initialization to initialize the module.
             */
            init: function (balInst) {
                bal = balInst;

                chrome.tabs.onUpdated.addListener(onTabUpdated);
                chrome.tabs.onActivated.addListener(onActivated);

                chrome.tabs.onRemoved.addListener(AvastWRC.onTabRemoved);

                // chrome.webNavigation might also be an option, but it has a bug that affects google search result page: https://bugs.chromium.org/p/chromium/issues/detail?id=115138
                chrome.webRequest.onBeforeRedirect.addListener(onRedirect, { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] });

                chrome.runtime.onMessage.addListener(messageHub);

                chrome.webRequest.onSendHeaders.addListener(
                    AvastWRC.onSendHeaders,
                    { urls: ['http://*/*', 'https://*/*'] },
                    ['requestHeaders']
                );
            },
            /**
             * Called after initialization to kick some functionality on start.
             */
            // afterInit: function () {
            //   AvastWRC.bal.checkPreviousVersion(AvastWRC.CONFIG.CALLERID);
            // },

            /* Register SafePrice Event handlers */
            registerModuleListeners: function (ee) {

            }


        }); // AvastWRC.bs.aos

    AvastWRC.bal.registerModule(AvastWRC.bs.core);
    /*
  if (!AvastWRC.getStorage("landingPageShown")) {
      AvastWRC.bal.openLandingPageTab();
  }
  */
}).call(this, _);
/*******************************************************************************
 *  avast! browsers extensions
 *  (c) 2012-2014 Avast Corp.
 *
 *  Background Browser Specific - AOS specific
 *
 ******************************************************************************/

(function(_) {

  var bal = null; //AvastWRC.bal instance - browser agnostic

  var RATING_ICONS = ['status-none.png','status-ok.png','status-attention.png','status-warning.png'];
    // 0 - NONE, 1 - GOOD, 2 - AVERAGE, 3 - BAD

  var allowedDomains = ["bestbuy.com", 
                        "walmart.com", 
                        "target.com", 
                        "costco.com", 
                        "bjs.com", 
                        "jet.com", 
                        "netflix.com", 
                        "flipkart.com", 
                        "snapdeal.com", 
                        "samsclub.com",
                        "intuit.com", // 2nd round
                        "turbotax.com", 
                        "hrblock.com",
                        "taxact.com", 
                        "freetaxusa.com", 
                        "taxslayer.com", 
                        "jacksonhewitt.com",
                        "homedepot.com",
                        "lowes.com",
                        "kohls.com",
                        "sears.com",
                        "overstock.com",
                        "macys.com",
                        "neimanmarcus.com",
                        "macys.com",
                        "nordstrom.com",
                        "tjx.com",
                        "etsy.com",
                        "hulu.com",
                        "ebay.com",
                        "dickssportinggoods.com",
                        "finishline.com",
                        "walgreens.com",
                        "kmart.com",
                        "dollartree.com",
                        "biglots.com",
                        "familydollar.com",
                        "alibaba.com"
                        ];
  
  var timeSlot = 200;
  var isDomainFilter = true; // is Domain filter activated then allow only domains from list

  var classNameBlackList = ["btn", "btn-sm", "btn-block", "btn-secondary", "btn-lg"];
  var currentPosition = {}; //{ windowId: windowId, hostname: hostname, domain: domain, tabId: tab.id };
  var pendingActions = {};
  var userAction = null;
  
  var ajaxFilter = {
      urls: ['http://*/*', 'https://*/*'],
      types: ['main_frame', 'xmlhttprequest']
  };

  /**
   * Update toolbar button
   *
   * @param  {Object} urlinfo Instance of UrlInfo class
   * @param  {Object} tab     Tab object properties
   * @return {void}
   */
  function updateButton(url, urlinfo, tab) {
    var ratingText = urlinfo.getRatingString();
    var weightText = urlinfo.getWeightString();
    var iconString = RATING_ICONS[urlinfo.getRatingCategory()];

    // is the tab still opened?
    AvastWRC.bs.tabExists.call(this, tab.id, function(){
        chrome.browserAction.setIcon({ path : 'common/ui/icons/' + iconString, tabId:tab.id});
        var title = "Avast - " + AvastWRC.bs.getLocalizedString(ratingText) + " " + AvastWRC.bs.getLocalizedString(weightText);
        if (!AvastWRC.Utils.getBrowserInfo().isEdge()) {
            chrome.browserAction.setTitle({ title: title, tabId: tab.id });
        }
    });
  }

  /**
   * Event handler to run and inject SERP colouring rules.
   * @param {Object} details    triggered event details
   * @return {void}
   */
  function onTabUpdated(tabId, info, tab) {
    if (info.status === "complete" && AvastWRC.CONFIG.ENABLE_WEBREP_CONTROL && AvastWRC.CONFIG.ENABLE_SERP && AvastWRC.bal.search) {
        setTimeout(function () { AvastWRC.bal.search.checkSearch(tab); }, 1000);  // Google renders the page through JavaScript, so we better wait
      }
    currentPosition.tabId = tabId;
    currentPosition.domain = AvastWRC.bal.getDomainFromUrl(tab.url);
  }
  
  /**
   * Event handler for ajax requests.
   * @param {Object} details triggered event details
   * @return {void}
   */
  function onCommitted(details) {
  	AvastWRC.bs.tabExists.call(this, details.tabId, function(){
	        chrome.tabs.get(details.tabId, function (tab) {
	            // ignore unsuported tab urls like chrome://, about: and chrome.google.com/webstore - these are banned by google.
	            
	            if (!AvastWRC.bs.checkUrl(tab.url)) {	                
	                chrome.browserAction.disable(details.tabId);
	                return;
	            }
	            //enable the browser extension	            
	            chrome.browserAction.enable(details.tabId);	            
	
	            if (details.transitionType !== undefined && details.transitionType !== "auto_subframe") {
	
	                var origin = {
	                    url: details.url,
	                    windowNum: tab.windowId,
	                    tabNum: details.tabId,
	                    origin: AvastWRC.bs.getOrigin(details.transitionType, details.transitionQualifiers),
	                    hash: AvastWRC.bal.utils.getHash(details.url + details.tabId + tab.windowId)
	                };
	
	                console.log("onCommitted() hash:" + origin.hash + " origin:" + origin.origin + " url:" + origin.url);
	                AvastWRC.TabReqCache.set(details.tabId, 'origin', origin);
	            }
	
	        });
  	});
  }  

  function filterClassName(name) {
      if (!_.isString(name) || name.length === 0 || name.indexOf(" ") === -1) return name;
      var names = name.split(" ");
      var results = "";
      for (var n in names) {
          if (classNameBlackList.indexOf(names[n]) === -1) {
              results += " " + names[n];
          }
      }
      return results.trim();
  }

  function updateCurrentWindowId() {
      chrome.tabs.query({ "windowId": chrome.windows.WINDOW_ID_CURRENT, "active" : true },
          function (tabInfo) {
              if (!_.isArray(tabInfo) || tabInfo.length === 0) {
                  return;
              }
              currentPosition.windowId = tabInfo[0].windowId;
              currentPosition.tabId = tabInfo[0].id;
              currentPosition.domain = AvastWRC.bal.getDomainFromUrl(tabInfo[0].url);
              //console.log("ajax currentPosition new: ", currentPosition);
          });
  }

   /**
   * Event handler to catch Ajax request.
   * @param {Object} details    triggered event details
   * @return {void}
   */
  function onBeforeRequest(details) {

      var requestId = details.requestId;
      var tabId = details.tabId;
      var method = details.method;
      var type = details.type;
      var url = details.url;	  
	  
	  if(type === 'main_frame')
	  {
		  var blockOnBeforeRequest = AvastWRC.TabReqCache.get(tabId, 'onBeforeReq');
		  if(blockOnBeforeRequest && blockOnBeforeRequest.blocked == true && url != AvastWRC.SITE_CORRECT_MSG_REDIRECT){
			return {cancel: true};
		  } 
	  }
      if (currentPosition && currentPosition.tabId === tabId) {
        
          var domain = AvastWRC.bal.getDomainFromUrl(url);

          if (type === 'xmlhttprequest' && currentPosition.domain === domain) {
              pendingActions[requestId] = details;
              //console.log("ajax new pendingActions: " + requestId);
          } else {
              pendingActions = {};
              userAction = null;
          }
      }
  }

    /**
    * Event handler to catch Ajax request.
    * @param {Object} details    triggered event details
    * @return {void}
    */
  function onResponseStarted(details) {
      var tabId = details.tabId;
      var method = details.method;
      var requestId = details.requestId;

      if (currentPosition && currentPosition.tabId === tabId) {
          switch (method) {
              case 'GET':
              case 'POST':
              case 'PUT':
              case 'DELETE':
                  
                  if (pendingActions[requestId] && userAction) {
                      var req = pendingActions[requestId];

                      var keys = [
                          //{ key: 'url', value: req.url },
                          { key: 'request', value: "ajax" },
                          //{ key: 'text', value: userAction.text },
                          //{ key: 'node', value: userAction.node },
                          { key: 'className', value: filterClassName(userAction.className) },
                          { key: 'method', value: req.method }];


                      if (isDomainFilter) {
                          var domain = AvastWRC.bal.getDomainFromUrl(req.url);
                          if (allowedDomains.indexOf(domain) === -1) {
                        	  console.log("skip ajax request", JSON.stringify(keys));
                              break;
                          }
                      }

                      var urlDetails = {
                          url: req.url,
                          tabNum: tabId,
                          windowNum: currentPosition.windowId,
                          customKeyValue: keys
                      };

                      console.log("send ajax to UrlInfo requestId: " + requestId, JSON.stringify(keys));
                      AvastWRC.get(urlDetails, function (res) {
                      });

                      setTimeout(function () {
                          return userAction = null;
                      }, timeSlot);
                  }
          }
      }
  }

  function onCompleted(details) {
      var tabId = details.tabId;
      var requestId = details.requestId;

      if (currentPosition && currentPosition.tabId === tabId) {
          delete pendingActions[requestId];
      }
  }

  function onErrorOccurred(details) {
      var error = details.error;
      var requestId = details.requestId;
      var tabId = details.tabId;
            
      if (details.type === "main_frame" 
    	  || details.type === "xmlhttprequest"
    	  && (currentPosition && currentPosition.tabId === tabId)) {
          delete pendingActions[requestId];
      }
  }

  function onMessage (request, sender, sendResponse) {
      updateCurrentWindowId();
      userAction = request;
      console.log("ajax userAction", JSON.stringify(userAction));
      
      var type = request.type || "";
      var tab = sender.tab;
      if(type === 'pageTitle')
	  {
    	  var url = tab.url || (tab.contentDocument && tab.contentDocument.location
    		        ? tab.contentDocument.location.href : null);
    	  var host = AvastWRC.bal.getHostFromUrl(url);
    	  
    	  var keys = [
			             { key: 'title', value: request.title},
			           	 {key: 'host', value: host}
			         ];
    	  AvastWRC.Queue.set("pageTitle", keys);
	  }
  }

    /**
     * Sidebar data generator
     */
  function openSidebar(tab) {
    var host = AvastWRC.bs.getHostInTab(tab.id) || bal.getHostFromUrl(tab.url);
    AvastWRC.bs.setHostInTab(tab.id, host);

    var data = {
      message : 'populate',
      data: {
        dnt    : bal.DNT.compute(tab.id, host),
        webrep : bal.WebRep.compute(host)
      }
    };
    AvastWRC.bs.accessContent(tab, data);
  }
  /**
   * Extension button handler
   */
  function actionClicked() {
    AvastWRC.bs.accessTab( openSidebar );
  }

  /**
   * On Before Request handler - used by DNT feature
   * Synchronous - Blocking !!!
   */
  function checkDNT(request) {
	  
    if(request.type !== 'main_frame' &&
      bal.DNT.isTracking(
        request.url,
        AvastWRC.bs.getHostInTab(request.tabId),
        request.tabId))
    {
      if (request.type == 'sub_frame') {
        return { redirectUrl: 'about:blank' };
      }
      else if (request.type == 'image') {
        return {
          redirectUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAFElEQVR4XgXAAQ0AAABAMP1L30IDCPwC/o5WcS4AAAAASUVORK5CYII='
        };
      }
      else {
        var mock =AvastWRC.Utils.resolveLocalMock(request.url);
        if (mock) {
          return {
            redirectUrl : chrome.extension.getURL("common/mocks/" + mock)
          };
        } else {
          return {cancel: true};
        }
      }
    }
    else {
      return {cancel: false};
    }
  }
 
  /*****************************************************************************
   * bs.aos - browser specific AOS functionality
   ****************************************************************************/
  AvastWRC.bs.aos = AvastWRC.bs.aos || {};
  _.extend(AvastWRC.bs.aos, // Browser specific
  {
    /**
     * Function called on BAL initialization to initialize the module.
     */
    init: function (balInst) {
      bal = balInst;

      chrome.tabs.onUpdated.addListener(onTabUpdated);
      chrome.webNavigation.onCommitted.addListener(onCommitted);
      
      chrome.browserAction.onClicked.addListener(actionClicked);

      chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest, ajaxFilter, ["blocking"]);
      chrome.webRequest.onResponseStarted.addListener(onResponseStarted, ajaxFilter, ['responseHeaders']);
      chrome.webRequest.onCompleted.addListener(onCompleted, ajaxFilter, ['responseHeaders']);
      chrome.webRequest.onErrorOccurred.addListener(onErrorOccurred, {urls: ['http://*/*', 'https://*/*']});
      chrome.runtime.onMessage.addListener(onMessage);


      bal.hookOnFeatureChange('dnt', function(enabled) {    	
        if (enabled) {        	
        	chrome.webRequest.onBeforeRequest.addListener(checkDNT,
        			{urls: ['http://*/*', 'https://*/*']}, ['blocking']);
        } else {
        	chrome.webRequest.onBeforeRequest.removeListener(checkDNT);
        	AvastWRC.bal.DNT.resetAllTabs();
        }    	
      }.bind(this));
    },
    /**
     * Called after initialization to kick some functionality on start.
     */
    afterInit: function () {
      AvastWRC.bal.checkPreviousVersion(AvastWRC.CONFIG.CALLERID);
    },

    /* Register SafePrice Event handlers */
    registerModuleListeners: function(ee) {
      ee.on('badgeInfoUpdated',
        AvastWRC.Utils.throttle(
          function(tab_id, host, getData) {
            var data = getData(tab_id, host); // {text: ..., color: ...}
            if(data) {
              chrome.browserAction.setBadgeBackgroundColor({tabId: tab_id, color: data.color });
              chrome.browserAction.setBadgeText({tabId: tab_id, text: data.text});
            }
          },
        100)
      );

      // update bowser action button
      ee.on('urlInfo.response', updateButton);
    }


  }); // AvastWRC.bs.aos

  AvastWRC.bal.registerModule(AvastWRC.bs.aos);

}).call(this, _);


(function (_) {
    
    AvastWRC.bal.modifyInjectLibs(function (injectLibs) {
        if (injectLibs && injectLibs.css) {
            //injectLibs.css.push('common/ui/css/style.modal.css');
        }
        return injectLibs;
    });
    
}).call(this, _);

/*******************************************************************************
 *  avast! browsers extensions
 *  (c) 2012-2014 Avast Corp.
 *
 *  Background Browser Specific - AOS specific - module for stadalone execution
 *
 ******************************************************************************/

(function(AvastWRC, chrome, _) {

  var EDITIONS_CONFIG = [
    // AOS
    { extType: AvastWRC.EXT_TYPE_AOS,  callerId: 1022, reqUrlInfoServices: 0xBF, extVer: 15, dataVer: 15 } // AOS (WR, P, B, SC)
  ];

  var _bal = null;

  /**
   * Definiion of supported extensions the AOS connects with .
   * Provide following function:
   *   extMatch - function to match the extension based on extension Info object
   *   msgHandle - function to handle message from the linked extension
   */
  var EXT_EXTENSIONS = [
    { // handle SP ext.
      linked : false,
      id : null,
      extMatch : function (extInfo) {
        return /SafePrice/.test(extInfo.name);
      },
      msgHandle : function (request, sender, sendResponse) {
        if (request.msg === 'event') { // pass sent events to emitter
          AvastWRC.bal.emitEvent(request.event, request);
        }
      }
    }
  ];

  var _activatedExt = {};

  // function initSafePrice

  /**
   * Link matched extension on install or enable.
   */
  function findExtDesc (extInfo) {
    return _.find(EXT_EXTENSIONS, function(extd) {return extd.extMatch(extInfo);});
  }

  /**
   *
   * @param {Object} extDesc - can be either extDesc from EXT_EXTENSIONS or exteInfo from chrome management.
   */
  function initExt (extDesc, extInfo) {
    if (extInfo.id) {
      chrome.runtime.sendMessage(extInfo.id, {msg: 'init', sender_id: chrome.runtime.id },
        function(response) {
          extDesc.id = extInfo.id;
          extDesc.linked = true;
          _activatedExt[extInfo.id] = extDesc;
        }
      );
    }
  }

  function onStarted (extInfo) {
    var extDesc = findExtDesc(extInfo);
    if (extDesc) {
      initExt(extDesc, extInfo);
    }
  }

  function onFinished (extId) {
    var extDesc = _activatedExt[extId];
    if (extDesc) {
      extDesc.linked = false;
      extDesc.id = null;
      delete _activatedExt[extId];
    }
  }

  AvastWRC.bs.aos.sa = AvastWRC.bs.aos.sa || {};
   _.extend(AvastWRC.bs.aos.sa, // Browser specific
    {
      /**
       * Function called on BAL initialization to initialize the module.
       */
      init: function (balInst) {

        _bal = balInst;

        // find extensions to control
        // chrome.management.getAll(function(extInfos) {
        //   _(EXT_EXTENSIONS)
        //     .map(function(extDesc) {
        //       var extInfo = _.find(extInfos, extDesc.extMatch);
        //       return (extInfo && extInfo.enabled) ? [extDesc, extInfo] : null;
        //     })
        //     .compact()
        //     .each(function(d) {
        //       initExt(d[0], d[1]);
        //     });
        // });

        // chrome.management.onInstalled.addListener(onStarted);
        // chrome.management.onEnabled.addListener(onStarted);
        // chrome.management.onUninstalled.addListener(onFinished);
        // chrome.management.onDisabled.addListener(function(extInfo) { onFinished(extInfo.id); });

        // chrome.runtime.onMessageExternal.addListener(
        //   function(request, sender, sendResponse) {
        //     var extDesc = _activatedExt[sender.id];
        //     extDesc.msgHandle(request, sender, sendResponse);
        //   }
        // );

        // chrome.runtime.onSuspend.addListener(function () {
        //   _.forOwn(_activatedExt, function(extDesc, id) {
        //     chrome.runtime.sendMessage(id, {msg: 'close', sender_id: chrome.runtime.id });
        //   });
        // });
    },

  }); // AvastWRC.bs.aos.sa

  AvastWRC.bal.registerModule(AvastWRC.bs.aos.sa);


  AvastWRC.init( EDITIONS_CONFIG[0].callerId ); // initialize the avastwrc modules - default callerId to AOS
  // Start background page initilizing BAL core
  AvastWRC.bal.init('Chrome', AvastWRC.bs, localStorage, EDITIONS_CONFIG);

}).call(this, AvastWRC, chrome, _);
