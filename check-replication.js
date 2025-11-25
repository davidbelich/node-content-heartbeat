#!/usr/bin/env node

// URL to hit for notifications
const NTFY = "";

// BASE URLS to heartbeat
const urls = {
  drupal: "",
  api: "",
  ember: "",
};

// MODIFIED URLS for content check
const contentUrls = {
  drupal: urls["drupal"] + "rest/content?page=0",
  api: urls["api"] + "?format=json",
  ember: urls["ember"] + "",
};

/**
 * Parses through a json object and finds the latest created content id
 * 
 * @param {*} json
 * @returns string
 */
function findLatestContentId(json) {
  const published = json.filter(
    (item) =>
      item.status[0]["value"] === true || item.status[0]["value"] === "true"
  );

  if (published.length === 0) {
    throw new Error("No published content found.");
  }

  // Assuming API returns sorted newest → oldest.
  // If not, sort manually by created timestamp:
  published.sort((a, b) => parseInt(b.created, 10) - parseInt(a.created, 10));

  const latest = published[0];
  const id = latest.nid[0]["value"] || latest.uuid;

  console.log("Latest published content ID:", id);

  if (!id) {
    throw new Error("No ID found in the latest published content.");
  }
  return id;
}

/**
 * Function controlling notifications
 * 
 * @param {string} message 
 * @param {string} priority 
 * @param {string} topicUrl 
 */
async function pushNtfy(message, priority = "low", topicUrl = NTFY) {
  try {
    const title = (priority == 'low'?'Everything is fine':'Something is down')
    const response = await fetch(topicUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain", //accepts markdown also
        'Title': title,
        'Priority': priority,
      },
      body: message,
    });

    if (!response.ok) {
      throw new Error(`ntfy responded ${response.status}`);
    }

    console.log("✅ ntfy notification sent");
  } catch (err) {
    console.error("❌ Failed to push ntfy notification:", err);
  }
}

/**
 * Checks the stack for uptime heartbeats
 *
 * @param {string} key
 */
async function heartbeat(key) {
  try {
    const res = await fetch(urls[key]);
    if (!res.ok) {
      pushNtfy(
        `Looks like the ${key} site at ${urls[key]} is down`,
        "critical"
      );
    }
  } catch (err) {
    pushNtfy(err.message, "high");
    console.error("ERROR trying to heartbeat:", err.message);
    console.error(err);
  }
}

/**
 * Main function run
 */
async function run() {
  try {

    // Grab the latest content straight fro drupal, bypassing database replication
    const res = await fetch(contentUrls["drupal"]);
    const json = await res.json();
    const id = findLatestContentId(json);

    const targetUrl = `${contentUrls["ember"]}${id}`;
    const pageRes = await fetch(targetUrl);

    if (pageRes.ok) {
      pushNtfy(`Content ${id} from ${contentUrls["drupal"]} is replicated to ${targetUrl}`);
    } else {
      pushNtfy(
        `Recent page ${contentUrls["drupal"]}${id} is NOT found`,
        "high"
      );
    }
  } catch (err) {
    pushNtfy(err.message, "high");
    console.error("ERROR:", err.message);
    console.error(err);
  }
}

/**
 * Iterates through BASE urls and checks heartbeat
 */
async function checkHeartbeat() {
  Object.entries(urls).forEach(([key, value]) => {
    heartbeat(key);
  });
}

checkHeartbeat();
run();
