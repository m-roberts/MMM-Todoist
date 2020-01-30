/* global Module */

/* Magic Mirror
 * Module: MMM-Todoist
 *
 * By Chris Brooker
 *
 * MIT Licensed.
 */


/*
 * Update by mabahj 24/11/2019
 * - Added support for labels in addtion to projects
 * Update by AgP42 the 18/07/2018
 * Modification added :
 * - Management of a PIR sensor with the module MMM-PIR-Sensor (by PaViRo). In case PIR module detect no user,
 * the update of the ToDoIst is stopped and will be requested again at the return of the user
 * - Management of the "module.hidden" by the core system : same behaviour as "User_Presence" by the PIR sensor
 * - Add "Loading..." display when the infos are not yet loaded from the server
 * - Possibility to add the last update time from server at the end of the module.
 * This can be configured using "displayLastUpdate" and "displayLastUpdateFormat"
 * - Possibility to display long task on several lines(using the code from default module "calendar".
 * This can be configured using "wrapEvents" and "maxTitleLength"
 *
 * // Update 27/07/2018 :
 * - Correction of start-up update bug
 * - correction of regression on commit #28 for tasks without dueDate
 * */

//UserPresence Management (PIR sensor)
var UserPresence = true; //true by default, so no impact for user without a PIR sensor

Module.register("MMM-Todoist", {

	defaults: {
		maximumEntries: 10,
		projects: ["inbox"],
    	labels: [""],
		updateInterval: 10 * 60 * 1000, // every 10 minutes,
		fade: true,
		fadePoint: 0.25,
		sortType: "todoist",

		//New config from AgP42
		displayLastUpdate: false, //add or not a line after the tasks with the last server update time
		displayLastUpdateFormat: "dd - HH:mm:ss", //format to display the last update. See Moment.js documentation for all display possibilities
		maxTitleLength: 25, //10 to 50. Value to cut the line if wrapEvents: true
		wrapEvents: false, // wrap events to multiple lines breaking at maxTitleLength
		displayTasksWithoutDue: true, // Set to false to not print tasks without a due date
		displayTasksWithinDays: -1, // If >= 0, do not print tasks with a due date more than this number of days into the future (e.g., 0 prints today and overdue)
		// 2019-12-31 by thyed
		displaySubtasks: true, // set to false to exclude subtasks
		displayAvatar: false,
		showProject: true,
		projectColors: ["#95ef63", "#ff8581", "#ffc471", "#f9ec75", "#a8c8e4", "#d2b8a3", "#e2a8e4", "#cccccc", "#fb886e",
			"#ffcc00", "#74e8d3", "#3bd5fb", "#dc4fad", "#ac193d", "#d24726", "#82ba00", "#03b3b2", "#008299",
			"#5db2ff", "#0072c6", "#000000", "#777777"
		], //These colors come from Todoist and their order matters if you want the colors to match your Todoist project colors.

		//This has been designed to use the Todoist Sync API.
		apiVersion: "v8",
		apiBase: "https://todoist.com/API",
		todoistEndpoint: "sync",

		todoistResourceType: "[\"items\", \"projects\", \"collaborators\"]", // thyed added user

		debug: false,
	},

	// Define required scripts.
	getStyles: function () {
		return ["MMM-Todoist.css"];
	},
	getTranslations: function () {
		return {
			en: "translations/en.json",
			de: "translations/de.json",
			nb: "translations/nb.json"
		};
	},

	start: function () {
		var self = this;
		Log.info("Starting module: " + this.name);

		this.updateIntervalID = 0; // Definition of the IntervalID to be able to stop and start it again
		this.ModuleToDoIstHidden = false; // by default it is considered displayed. Note : core function "this.hidden" has strange behaviour, so not used here

		//to display "Loading..." at start-up
		this.title = "Loading...";
		this.loaded = false;

		if (this.config.accessToken === "") {
			Log.error("MMM-Todoist: AccessToken not set!");
			return;
		}

		//Support legacy properties
		if (this.config.lists !== undefined) {
			if (this.config.lists.length > 0) {
				this.config.projects = this.config.lists;
			}
		}

		this.sendSocketNotification("FETCH_TODOIST", this.config);

		//add ID to the setInterval functionto be able to stop it later on
		this.updateIntervalID = setInterval(function () {
			self.sendSocketNotification("FETCH_TODOIST", self.config);
		}, this.config.updateInterval);
	},

	suspend: function () { //called by core system when the module is not displayed anymore on the screen
		this.ModuleToDoIstHidden = true;
		//Log.log("Fct suspend - ModuleHidden = " + ModuleHidden);
		this.GestionUpdateIntervalToDoIst();
	},

	resume: function () { //called by core system when the module is displayed on the screen
		this.ModuleToDoIstHidden = false;
		//Log.log("Fct resume - ModuleHidden = " + ModuleHidden);
		this.GestionUpdateIntervalToDoIst();
	},

	notificationReceived: function (notification, payload) {
		if (notification === "USER_PRESENCE") { // notification sended by module MMM-PIR-Sensor. See its doc
			//Log.log("Fct notificationReceived USER_PRESENCE - payload = " + payload);
			UserPresence = payload;
			this.GestionUpdateIntervalToDoIst();
		}
	},

	GestionUpdateIntervalToDoIst: function () {
		if (UserPresence === true && this.ModuleToDoIstHidden === false) {
			var self = this;

			// update now
			this.sendSocketNotification("FETCH_TODOIST", this.config);

			//if no IntervalID defined, we set one again. This is to avoid several setInterval simultaneously
			if (this.updateIntervalID === 0) {

				this.updateIntervalID = setInterval(function () {
					self.sendSocketNotification("FETCH_TODOIST", self.config);
				}, this.config.updateInterval);
			}

		} else { //if (UserPresence = false OR ModuleHidden = true)
			Log.log("Personne regarde : on stop l'update " + this.name + " projet : " + this.config.projects);
			clearInterval(this.updateIntervalID); // stop the update interval of this module
			this.updateIntervalID = 0; //reset the flag to be able to start another one at resume
		}
	},

	// Code from MichMich from default module Calendar : to manage task displayed on several lines

	/**
	 * Shortens a string if it's longer than maxLength and add a ellipsis to the end
	 *
	 * @param {string} string Text string to shorten
	 * @param {number} maxLength The max length of the string
	 * @param {boolean} wrapEvents Wrap the text after the line has reached maxLength
	 * @returns {string} The shortened string
	 */
	shorten: function (string, maxLength, wrapEvents) {
		if (typeof string !== "string") {
			return "";
		}

		if (wrapEvents === true) {
			var temp = "";
			var currentLine = "";
			var words = string.split(" ");

			for (var i = 0; i < words.length; i += 1) {
				var word = words[i];
				if (currentLine.length + word.length < (typeof maxLength === "number" ? maxLength : 25) - 1) { // max - 1 to account for a space
					currentLine += (word + " ");
				} else {
					if (currentLine.length > 0) {
						temp += (currentLine + "<br>" + word + " ");
					} else {
						temp += (word + "<br>");
					}
					currentLine = "";
				}
			}

			return (temp + currentLine).trim();
		} else {
			if (maxLength && typeof maxLength === "number" && string.length > maxLength) {
				return string.trim().slice(0, maxLength) + "&hellip;";
			} else {
				return string.trim();
			}
		}
	},
	//end modif AgP

	// Override socket notification handler.
	socketNotificationReceived: function (notification, payload) {
		if (notification === "TASKS") {
			this.filterTodoistData(payload);

			if (this.config.displayLastUpdate) {
				this.lastUpdate = Date.now() / 1000; //save the timestamp of the last update to be able to display it
			}

			Log.log("ToDoIst update OK, project : " + this.config.projects + " at : " + moment.unix(this.lastUpdate).format(this.config.displayLastUpdateFormat)); //AgP

			this.loaded = true;
			this.updateDom(1000);
		} else if (notification === "FETCH_ERROR") {
			Log.error("Todoist Error. Could not fetch todos: " + payload.error);
		}
	},

	filterTodoistData: function (tasks) {
		var self = this;
		var items = [];
    var labelIds = [];


		if (tasks == undefined) {
			return;
		}
		if (tasks.accessToken != self.config.accessToken) {
			return;
		}
		if (tasks.items == undefined) {
			return;
		}

    // Loop through labels fetched from API and find corresponding label IDs for task filtering
    // Could be re-used for project names -> project IDs.
    if (self.config.labels.length>0 && tasks.labels != undefined) {
      for (let apiLabel of tasks.labels) {
        for (let configLabelName of self.config.labels) {
          if (apiLabel.name == configLabelName) {
            labelIds.push(apiLabel.id);
            break;
          }
        }
      }
    }

		if (self.config.displayTasksWithinDays > -1 || !self.config.displayTasksWithoutDue) {
			tasks.items = tasks.items.filter(function (item) {
				if (item.due === null) {
					return self.config.displayTasksWithoutDue;
				}

				var oneDay = 24 * 60 * 60 * 1000;
				var dueDateTime = new Date(item.due.date);
				var dueDate = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());
				var now = new Date();
				var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
				var diffDays = Math.floor((dueDate - today + 7200000) / (oneDay));
				return diffDays <= self.config.displayTasksWithinDays;
			});
		}


		//Filter the Todos by the Projects and Label specified in the Config
		tasks.items.forEach(function (item) {

      var isAdded=0; // To prevent a task in added twice. Far from fancy, can be improved. But it works.

      // Filter using label if a label is configured
      if (labelIds.length>0 && item.labels.length > 0) {
        // Check all the labels assigned to the task. Add to items if match with configured label
        for (let label of item.labels) {
          for (let labelNumber of labelIds) {
            if (label == labelNumber && isAdded==0) {
              items.push(item);
              isAdded=1; // Prevent double additions
              break;
            }
          }
        }
      }

      // Filter using projets if projects are configured
      if (isAdded==0 && self.config.projects.length>0){
			  self.config.projects.forEach(function (project) {
			  	if (item.project_id == project) {
            items.push(item);
			  	}
			  });
      }


		});

		//Used for ordering by date
		items.forEach(function (item) {
			if (item.due === null) {
				item.due = {}
				item.due.date = "2100-12-31";
				item.all_day = true;
			}
			//Not used right now
			item.ISOString = new Date(item.due.date);

			// as v8 API does not have 'all_day' field anymore then check due.date for presence of time
			// if due.date has a time then set item.all_day to false else all_day is true
			if (item.due.date.length > 10) {
				item.all_day = false
			} else {
				item.all_day = true
			}
		});


		//***** Sorting code if you want to add new methods. */
		switch (self.config.sortType) {
			case "todoist":
				sorteditems = self.sortByTodoist(items);
				break;
			case "dueDateAsc":
				sorteditems = self.sortByDueDateAsc(items);
				break;
			case "dueDateDesc":
				sorteditems = self.sortByDueDateDesc(items);
				break;
			default:
				sorteditems = self.sortByTodoist(items);
				break;
		}

		//Slice by max Entries
		items = items.slice(0, this.config.maximumEntries);

		this.tasks = {
			"items": items,
			"projects": tasks.projects,
			"collaborators": tasks.collaborators
		};

	},
	sortByTodoist: function (itemstoSort) {
		itemstoSort.sort(function (a, b) {
			// 2019-12-31 bugfix by thyed, property is child_order, not item_order
			var itemA = a.child_order,
				itemB = b.child_order;
			return itemA - itemB;
		});
		return itemstoSort;
	},
	sortByDueDateAsc: function (itemstoSort) {
		itemstoSort.sort(function (a, b) {
			var dateA = new Date(a.ISOString),
				dateB = new Date(b.ISOString);
			return dateA - dateB;
		});
		return itemstoSort;
	},
	sortByDueDateDesc: function (itemstoSort) {
		itemstoSort.sort(function (a, b) {
			var dateA = new Date(a.ISOString),
				dateB = new Date(b.ISOString);
			return dateB - dateA;
		});
		return itemstoSort;
	},


	getDom: function () {

		//Add a new div to be able to display the update time alone after all the task
		var wrapper = document.createElement("div");

		//display "loading..." is not loaded
		if (!this.loaded) {
			wrapper.innerHTML = "Loading...";
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		var table = document.createElement("table");
		table.className = "normal small light";

		if (this.tasks === undefined) {
			return table;
		}


		// create mapping from user id to collaborator index
		var collaboratorsMap = new Map();

		for (var value=0; value < this.tasks.collaborators.length; value += 1) {
			collaboratorsMap.set( this.tasks.collaborators[value].id, value );
		}

		console.log(collaboratorsMap);


		/* iterate through items, i.e. todo's */
		for (var i = 0; i < this.tasks.items.length; i += 1) {
			var item = this.tasks.items[i];
			var row = document.createElement("tr");
			table.appendChild(row);

			/* cell for priority indicator */
			var priorityCell = document.createElement("td");
			switch (item.priority) {
				case 4:
					priorityCell.className = "priority priority1";
					break;
				case 3:
					priorityCell.className = "priority priority2";
					break;
				case 2:
					priorityCell.className = "priority priority3";
					break;
			}
			priorityCell.innerHTML = "";
			row.appendChild(priorityCell);

			var spacerCell = document.createElement("td");
			spacerCell.className = "spacerCell";
			spacerCell.innerHTML = "";
			row.appendChild(spacerCell);

			/* cell for todo content */
			var todoCell = document.createElement("td");
			todoCell.className = "title bright alignLeft";
			todoCell.innerHTML = this.shorten(item.content, this.config.maxTitleLength, this.config.wrapEvents);
			row.appendChild(todoCell);

			/* cell for due date */
			var dueDateCell = document.createElement("td");
			dueDateCell.className = "bright align-right dueDate ";

			var oneDay = 24 * 60 * 60 * 1000;
			var dueDateTime = new Date(item.due.date);
			var dueDate = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());
			var now = new Date();
			var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			var diffDays = Math.floor((dueDate - today + 7200000) / (oneDay));
			var diffMonths = (dueDate.getFullYear() * 12 + dueDate.getMonth()) - (now.getFullYear() * 12 + now.getMonth());

			if (diffDays < -1) {
				dueDateCell.innerHTML = dueDate.toLocaleDateString(config.language, {
					"month": "short"
				}) + " " + dueDate.getDate();
				dueDateCell.className += "xsmall overdue";
			} else if (diffDays === -1) {
				dueDateCell.innerHTML = this.translate("YESTERDAY");
				dueDateCell.className += "xsmall overdue";
			} else if (diffDays === 0) {
				dueDateCell.innerHTML = this.translate("TODAY");
				if (item.all_day || dueDateTime >= now) {
					dueDateCell.className += "today";
				} else {
					dueDateCell.className += "overdue";
				}
			} else if (diffDays === 1) {
				dueDateCell.innerHTML = this.translate("TOMORROW");
				dueDateCell.className += "xsmall tomorrow";
			} else if (diffDays < 7) {
				dueDateCell.innerHTML = dueDate.toLocaleDateString(config.language, {
					"weekday": "short"
				});
				dueDateCell.className += "xsmall";
			} else if (diffMonths < 7 || dueDate.getFullYear() == now.getFullYear()) {
				dueDateCell.innerHTML = dueDate.toLocaleDateString(config.language, {
					"month": "short"
				}) + " " + dueDate.getDate();
				dueDateCell.className += "xsmall";
			} else if (item.due.date === "2100-12-31") {
				dueDateCell.innerHTML = "";
				dueDateCell.className += "xsmall";
			} else {
				dueDateCell.innerHTML = dueDate.toLocaleDateString(config.language, {
					"month": "short"
				}) + " " + dueDate.getDate() + " " + dueDate.getFullYear();
				dueDateCell.className += "xsmall";
			}

			if (dueDateCell.innerHTML !== "" && !item.all_day) {
				function formatTime(d) {
					function z(n) {
						return (n < 10 ? "0" : "") + n;
					}
					var h = d.getHours();
					var m = z(d.getMinutes());
					if (config.timeFormat == 12) {
						return " " + (h % 12 || 12) + ":" + m + (h < 12 ? " AM" : " PM");
					} else {
						return " " + h + ":" + m;
					}
				}
				dueDateCell.innerHTML += formatTime(dueDateTime);
			}
			row.appendChild(dueDateCell);

			/* cell for project */
			if (this.config.showProject) {
				var spacerCell2 = document.createElement("td");
				spacerCell2.className = "spacerCell";
				spacerCell2.innerHTML = "";
				row.appendChild(spacerCell2);

				var project = this.tasks.projects.find(p => p.id === item.project_id);
				var projectcolor = this.config.projectColors[project.color];
				var projectCell = document.createElement("td");
				projectCell.className = "xsmall";
				projectCell.innerHTML = project.name + "<span class='projectcolor' style='color: " + projectcolor + "; background-color: " + projectcolor + "'></span>";
				row.appendChild(projectCell);
			}

			/* cell for assignee avatar */
			if (this.config.displayAvatar) {
				var avatarCell = document.createElement("td");
				var avatarImg = document.createElement("img");
				avatarImg.className = "todoAvatarImg";

				var colIndex = collaboratorsMap.get(item.responsible_uid);
				if (typeof colIndex !== 'undefined') {

					avatarImg.src = "https://dcff1xvirvpfp.cloudfront.net/" + this.tasks.collaborators[colIndex].image_id + "_big.jpg";
				} else {
                    avatarImg.src = "/modules/MMM-Todoist/1x1px.png";
                }

				avatarCell.appendChild(avatarImg);
				row.appendChild(avatarCell);
			}

			// Create fade effect by MichMich (MIT)
			if (this.config.fade && this.config.fadePoint < 1) {
				if (this.config.fadePoint < 0) {
					this.config.fadePoint = 0;
				}
				var startingPoint = this.tasks.items.length * this.config.fadePoint;
				var steps = this.tasks.items.length - startingPoint;
				if (i >= startingPoint) {
					var currentStep = i - startingPoint;
					row.style.opacity = 1 - (1 / steps * currentStep);
				}
			}
			// End Create fade effect by MichMich (MIT)
		}
		wrapper.appendChild(table); //quand la table est finie (loop des sensors finie), on l'ajoute au wrapper


		// display the update time at the end, if defined so by the user config
		if (this.config.displayLastUpdate) {

			var updateinfo = document.createElement("div");
			updateinfo.className = "xsmall light align-left";
			updateinfo.innerHTML = "Update : " + moment.unix(this.lastUpdate).format(this.config.displayLastUpdateFormat);
			wrapper.appendChild(updateinfo);
		}

		return wrapper;
	}


});
