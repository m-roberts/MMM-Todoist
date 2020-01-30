"use strict";

/* Magic Mirror
 * Module: MMM-Todoist
 *
 * By Chris Brooker
 *
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const request = require("request");

module.exports = NodeHelper.create({
	start: function() {
		console.log("Starting node helper for: " + this.name);
	},

	socketNotificationReceived: function(notification, payload) {
		if (notification === "FETCH_TODOIST") {
			this.config = payload;
			this.fetchTodos();
		}
	},

	fetchTodos: function() {
		var self = this;

		var apiUrl = self.config.apiBase + "/"
			+ self.config.apiType + "/"
			+ self.config.apiVersion + "/"
			+ self.config.todoistEndpoint;

		// Handle filters here - project and label filtering can still be done as with Sync API
		if (self.config.filter) {
			apiUrl = apiUrl + "?filter=" + encodeURIComponent(self.config.filter)
		}

		if (self.config.debug) {
			// request.debug = true;
			console.log("API URL: " + apiUrl)
		}

		request({
			url: apiUrl,
			headers: {
				"Authorization": "Bearer " + self.config.accessToken
			}
		},
		function(error, response, body) {
			if (error) {
				self.sendSocketNotification("FETCH_ERROR", {
					error: error
				});
				return console.error(" ERROR - MMM-Todoist: " + error);
			}
			if (self.config.debug) {
				console.log(body)
			}
			if (response.statusCode === 200) {
				var taskJson = JSON.parse(body);
				taskJson.accessToken = self.config.accessToken;
				self.sendSocketNotification("TASKS", taskJson);
			}
			else {
				console.log("Todoist API request status: " + response.statusCode)
			}
		});
	}
});
