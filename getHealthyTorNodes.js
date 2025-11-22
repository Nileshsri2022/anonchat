// Using xmr.ditatompel.com API - No tracking, dedicated for Monero nodes

const DITATOMPEL_API = "https://xmr.ditatompel.com/api/v1/nodes";

async function fetchHealthyTorNodes() {
  console.log("🔍 Fetching Monero Tor nodes from ditatompel API...\n");

  try {
    // Query parameters for Tor nodes
    const params = new URLSearchParams({
      nettype: "mainnet",
      protocol: "http",      // Tor uses HTTP
      cors: "1",             // CORS enabled
      status: "1",           // Only online nodes (is_available=true)
      sort_by: "last_checked",
      sort_direction: "desc"
    });

    const response = await fetch(`${DITATOMPEL_API}?${params}`, {
      headers: {
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== "ok" || !data.data?.items) {
      throw new Error("Invalid API response format");
    }

    console.log(`📊 Total nodes from API: ${data.data.items.length}`);

    // Debug: Show first node to understand structure
    if (data.data.items.length > 0) {
      console.log("🔍 Sample node data:", JSON.stringify(data.data.items[0], null, 2));
    }

    // Filter for Tor (.onion) nodes - relaxed filters
    const torNodes = data.data.items
      .filter(node => {
        const hostname = node.hostname || "";
        const isTor = hostname.includes(".onion");
        
        // Debug logging
        if (isTor) {
          console.log(`🧅 Found Tor node: ${hostname}, available: ${node.is_available}, height: ${node.height}, status: ${node.status}`);
        }
        
        return (
          isTor &&
          node.is_available === true &&
          (node.height || 0) > 2800000  // Lower threshold
        );
      })
      .map(node => {
        const port = node.port || 18081;
        return `http://${node.hostname}:${port}`;
      });

    console.log(`✅ Found ${torNodes.length} healthy Tor RPC nodes\n`);

    return torNodes;

  } catch (error) {
    console.error(`❌ API Error: ${error.message}`);
    console.log("\n⚠️  Using fallback nodes...\n");
    return getFallbackNodes();
  }
}

function getFallbackNodes() {
  return [
    "http://moneroxmrxw44lku6qniyarpwgznpcwml4drq7vb24ppatlcg4kmxpqd.onion:18081",
    "http://zbjkbsxc5munw3qusl7j2hpcmikhqocdf4pqhnhtpzw5nt5jrmofptid.onion:18081",
    "http://monerovzwqqr3j7s7omwumh6cjx2udhbptkd5p6fvsuyp2vssyyksqd.onion:18081",
    "http://xmr-node-uk.cakewallet.com:18081" // Cake Wallet backup
  ];
}

// Additional: Fetch clearnet nodes (for comparison/backup)
async function fetchClearnetNodes(limit = 5) {
  try {
    const params = new URLSearchParams({
      nettype: "mainnet",
      protocol: "https",
      status: "1",
      sort_by: "uptime",
      sort_direction: "desc"
    });

    const response = await fetch(`${DITATOMPEL_API}?${params}`, {
      signal: AbortSignal.timeout(10000)
    });

    const data = await response.json();

    if (data.status === "ok" && data.data?.items) {
      return data.data.items
        .filter(n => n.is_available && !n.hostname.endsWith(".onion"))
        .slice(0, limit)
        .map(n => `https://${n.hostname}:${n.port || 18081}`);
    }
  } catch (error) {
    console.error(`Clearnet fetch failed: ${error.message}`);
  }
  return [];
}

// Main execution
async function main() {
  const torNodes = await fetchHealthyTorNodes();

  if (torNodes.length > 0) {
    console.log("📋 Healthy Tor (.onion) RPC Nodes:");
    torNodes.forEach((node, i) => {
      console.log(`  ${i + 1}. ${node}`);
    });
  }

  // Optionally get clearnet nodes too
  console.log("\n🌐 Fetching top clearnet nodes for comparison...");
  const clearnet = await fetchClearnetNodes(3);
  
  if (clearnet.length > 0) {
    console.log("\n📋 Top Clearnet Nodes (HTTPS):");
    clearnet.forEach((node, i) => {
      console.log(`  ${i + 1}. ${node}`);
    });
  }

  return { torNodes, clearnet };
}

main().catch(console.error);
