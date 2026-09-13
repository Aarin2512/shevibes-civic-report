const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VALID_CATEGORIES = [
  "pothole",
  "streetlight",
  "garbage",
  "water_leak",
  "road_safety",
  "other",
] as const;

const PROMPT =
  "Classify the civic issue shown in this photo into exactly one of these categories: pothole, streetlight, garbage, water leak, road safety, other. Respond with only the category name and nothing else.";

const CATEGORY_ALIASES: Record<string, string> = {
  pothole: "pothole",
  streetlight: "streetlight",
  street_light: "streetlight",
  "street light": "streetlight",
  street_lighting: "streetlight",
  garbage: "garbage",
  trash: "garbage",
  litter: "garbage",
  water_leak: "water_leak",
  "water leak": "water_leak",
  water: "water_leak",
  leak: "water_leak",
  road_safety: "road_safety",
  "road safety": "road_safety",
  traffic: "road_safety",
  other: "other",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = req.headers.get("content-type") ?? "";
    let imageBase64: string | null = null;
    let mimeType: string = "image/jpeg";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      imageBase64 = body.image_base64 ?? null;
      mimeType = body.mime_type ?? "image/jpeg";
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("photo");
      if (file && file instanceof File) {
        const buf = await file.arrayBuffer();
        imageBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        mimeType = file.type || "image/jpeg";
      }
    }

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 20,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${geminiRes.status}`, detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiRes.json();
    const text: string =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const cleaned = text.trim().toLowerCase().replace(/[^a-z\s_]/g, "").trim();

    const normalized = CATEGORY_ALIASES[cleaned] ??
      CATEGORY_ALIASES[cleaned.replace(/\s+/g, "_")] ??
      CATEGORY_ALIASES[cleaned.replace(/_/g, "")] ??
      "other";

    const category = VALID_CATEGORIES.includes(
      normalized as (typeof VALID_CATEGORIES)[number]
    )
      ? normalized
      : "other";

    return new Response(
      JSON.stringify({ category }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
