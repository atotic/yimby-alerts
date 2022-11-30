#!/usr/bin/env node

// https://github.com/adasq/google-alerts-api
const googleAlerts = require('google-alerts-api');
// https://github.com/bertrandom/chrome-cookies-secure
const chromeCookies = require('chrome-cookies-secure');
// https://github.com/rbren/rss-parser
const rssParser = require('rss-parser');

require('dotenv').config()

const StoredCookie = process.env.GOOGLE_LOGIN_COOKIE

// Keywords we want to monitor
const DesiredKeywords = [
	"Sonia Trauss",
	"YIMBY",
];

function alertPrototype(keywords) {
	return {
    howOften: googleAlerts.HOW_OFTEN.AT_MOST_ONCE_A_DAY,
		sources: googleAlerts.SOURCE_TYPE.AUTOMATIC, // default one
    lang: 'en',
    name: keywords,
    region: 'any',
    howMany: googleAlerts.HOW_MANY.BEST,
    deliverTo: googleAlerts.DELIVER_TO.RSS,
    deliverToData: ''
    };
}

// Returns cookie that should be passed to googleAlerts 
async function readAlertCookies() {
	if (StoredCookie)
		return StoredCookie;
	console.warn(`Reading Chrome cookies...`);
	const cookies = await chromeCookies.getCookiesPromised("https://myaccount.google.com");

	// Instructions on how to get/package these cookies come from googleAlerts home page.
	let requiredCookies = ['SID', 'HSID', 'SSID'];
	let alertLibCookieObject = [];
	for (let r of requiredCookies) {
		if (!Object.hasOwn(cookies, r)) {
			throw `Could not read ${r} cookie from Chrome`;
		}
		alertLibCookieObject.push( {
			key: r, value: cookies[r], domain: 'google.com'
		});
	}
	//console.log(alertLibCookieObject);
	let encodedCookie = btoa(JSON.stringify(alertLibCookieObject));
	console.log(`Add this to your .env file to avoid reading Chrome's cookie jar
GOOGLE_LOGIN_COOKIE="${encodedCookie}"
`);
	return encodedCookie;
}

// Promise wrapper for googleAlerts
let AlertsAPI = {
	sync: async _ => {
		return new Promise( (resolve, reject) => {
			googleAlerts.sync( err => {
				if (err)
					reject(`alerts.sync error ${err}`);
				else
					resolve();
			});
		});
	},

	create: async name => {
		let a = alertPrototype(name);
		return new Promise( (resolve, reject) => {
			googleAlerts.create(a, (err, alert) => {
				if (err)
					reject(`failed to crete alert ${name} ${err}`);
				else
					resolve(alert);
			});
		});
	},

	remove: async (alertId, name) => {
		return new Promise( (resolve, reject) => {
			googleAlerts.remove(alertId, (err, alert) => {
				if (err)
					reject(`failed to remove alert ${name} ${alertId} ${err}`);
				else
					resolve(alert);
			});
		});
	},
}

// Updates alerts list to match desiredKeywords list
// - each keyword becomes an alert (if not there already)
// CURRENTLY NOT IMPLEMENTED FOR SAFETY:
	// - alerts not in the list are deleted.
async function updateKeywords(desiredKeywords) {
	let desiredMap = new Map(); // keyword => true
	let currentMap = new Map(); // keyword => googleAlertObject

	for (let alert of googleAlerts.getAlerts()) {
		currentMap.set(alert.name, alert);
	}
	let addKeywords = [];
	for (let keyword of desiredKeywords) {
		desiredMap.set(keyword, true);
		if (!currentMap.has(keyword))
			addKeywords.push(keyword);
	}
	let removeKeywords = []; // alert objects to be removed
	currentMap.forEach((value, key) => {
		if (!desiredMap.has(key))
			removeKeywords.push(value);
	});

	let additions = addKeywords.map( async keyword => {
		console.log(`Adding ${keyword}`);
		AlertsAPI.create(keyword);
	});
	let removals = [];
	// let removals = removeKeywords.map( async alert => {
	// 	console.log(`Removing ${alert.name}`);
	// 	AlertsAPI.remove(alert.id, alert.name);
	// });
	return Promise.all(additions.concat(removals));
}

// Returns a map of alert keyword => entries
async function readRss() {
	let parser = new rssParser();
	let entryMap;
	let feedReads = googleAlerts.getAlerts().map( async alert => {
		if (!alert.rss) {
			console.error(`Alert ${alert.name} missing rss feed`);
			return {};
		} else {
			console.log(`Reading ${alert.rss}`);
			let feed = await parser.parseURL(alert.rss);
			return {name: alert.name, feed: feed};
		}
	});
	return Promise.all(feedReads);
}

// feeds: {name: feed:}[]
async function processFeeds(feeds) {
	console.log("processing feeds");
	for (let f of feeds) {
		console.log(`Feed ${f.name} ${f.feed.items.length} items`);
		for (let item of f.feed.items) {
			console.log(item.title);
		}
	}
}

function usage() {
	console.log(`alerts.cjs manages google alerts
		`);
}
// Main 
// When ready for arguments
// let args = process.argv.slice(2);
// console.log(process.argv);

readAlertCookies().then( cookies => {
	// console.log("cookies read", cookies);
	googleAlerts.configure({cookies: cookies});
	return AlertsAPI.sync();
// }).then( _ => {
// 	const alertList = googleAlerts.getAlerts();
//   alertList.forEach(alert => console.log(alert));
}).then( _ => updateKeywords(DesiredKeywords) )
.then( _ => AlertsAPI.sync() )
.then( _ => readRss() ) 
.then( feeds => processFeeds(feeds) ) 
.catch(reason => {
		console.error("Could not get cookies", reason);
});

