## Campaign Monitor Extensions ##

A series of tasks for interacting with Campaign Montitor.

### Prerequisites

* You must have an account with Campaign Monitor.
* You must obtain your ClientId and your API Key from Campaign Monitor for use within the tasks.

### Create Campaign

This task creates a campaign from an existing template.

![Screenshot](https://raw.githubusercontent.com/gregpakes/vsts.extensions/master/extensions/campaignmonitor/screenshots/createcampaign.png)

**Configuration Options**

* **List Id**: This is the unique id of the subscriber list you with to send the campaign to.
* **Template Id**: This is the unique id of the custom template you wish to use.  Note: You cannot use a built in template.  The campaign monitor api does not allow this.  The only way I know to get your template id is to hit the api and query for it.
* **From Email Address**
* **Reply To Email Address**
* **Campaign Name**: The name of the campaign you wish to send.  This must be unique.
* **Email Subject**
* **Single Lines**: JSON representation for floating *singleline* tags.  Example: [{ "Content": "Support Centre" }, { "Content": "iSAMS Update - 0.0.1" }]
* **MultipleLines**: JSON representation for floating *multipleline* tags.  Example: [{"Content": "<p>This is a test email.</p> <p>This should be on another line.</p>"}]
* **MultipleLines Source**: Choose whether your multiplelines template is read from a file on disk or inline.
* **From Name**
* **Send Preview**: Whether you wish to send a preview email
* **Preview Recipient**: Who receives the preview email.

**Output Variable**
* **Output Variable**: Contains the created campaign id.

> More information regarding the SingleLines and Multiple Lines properties can be found here. https://www.campaignmonitor.com/api/campaigns/#creating-campaign-template

### Delete Campaign

This task deletes a campaign given a campaign id.

![Screenshot](https://raw.githubusercontent.com/gregpakes/vsts.extensions/master/extensions/campaignmonitor/screenshots/deletecampaign.png)

**Configuration Options**

* **Campaign Id**: The Id of the campaign to delete.

### Learn More

The [source](https://github.com/gregpakes/vsts.extensions) to this extension is available. Feel free to take, fork, and extend.

### Feedback ###
- https://github.com/gregpakes/vsts.extensions