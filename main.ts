const passwd: { [key: string]: string } = {
  "kl1nge5": "kl1nge5",
};

Deno.serve(async (req) => {
  const upgrade = req.headers.get("upgrade") || ""
  if (upgrade.toLowerCase() === "websocket") {
    const {socket, response} = Deno.upgradeWebSocket(req)
    const kv = await Deno.openKv()
    const all_keys: Deno.KvKey[] = []
    socket.onopen = async () => {
      for await (const entry of kv.list({ prefix: ["user"] })) {
        all_keys.push(entry.key)
      }
      const stream = kv.watch(all_keys)
      for await (const entries of stream) {
        const rs: { [key: string]: [boolean, number] } = {};
        for await (const entry of entries) {
          rs[entry.key[1] as string] = entry.value as [boolean, number];
        }
        socket.send(JSON.stringify(rs))
      }
    }
    socket.onmessage = (e) => {
      if (e.data === "ping") {
        socket.send("pong");
      }
    };
    return response;
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "*",
    "Access-Control-Allow-Headers": "*",
  };
  if (req.method === "POST") {
    const authHeader = req.headers.get("authorization");
    const credentials = parseBasicAuth(authHeader);
    if (credentials === null) {
      return new Response(null, { status: 401 });
    } else if (!(credentials.username in passwd)) {
      return new Response(null, { status: 401 });
    } else if (passwd[credentials.username] != credentials.password) {
      return new Response(null, { status: 401 });
    }
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      const event = formData.get("event");
      if (event === "screen-on") {
        const kv = await Deno.openKv();
        await kv.set(["user", "kl1nge5"], [true, Date.now()]);
        console.log(credentials.username, "screen-on");
      } else if (event === "screen-off") {
        const kv = await Deno.openKv();
        await kv.set(["user", "kl1nge5"], [false, Date.now()]);
        console.log(credentials.username, "screen-off");
      } else {
        return new Response(null, { status: 415 });
      }
      return new Response(`{}`, {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      return new Response(null, { status: 415 });
    }
  } else if (req.method === "GET") {
    const kv = await Deno.openKv();
    const rs: { [key: string]: boolean } = {};
    for await (const entry of kv.list({ prefix: ["user"] })) {
      rs[entry.key[1] as string] = entry.value as boolean;
      // console.log(entry.key, entry.value);
    }
    return new Response(JSON.stringify(rs), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(null, { status: 415 });
});

function parseBasicAuth(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Basic ")) return null;
  const b64 = authHeader.replace("Basic ", "");
  const decoded = atob(b64); // Base64 解码
  const [username, password] = decoded.split(":");
  return { username, password };
}
