import { designRoom, validateInput } from "../server/agent.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to create a room brief." });
  }
  let input;
  try {
    if (Number(req.headers?.["content-length"] || 0) > 12000)
      return res.status(413).json({ error: "Request too large." });
    input = validateInput(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  try {
    return res.status(200).json(await designRoom(input));
  } catch (e) {
    const expected =
      /fictional demo catalog|No Qloo match|too few different|No usable Qloo/.test(
        e.message,
      );
    return res
      .status(expected ? 422 : 503)
      .json({
        error: expected
          ? e.message
          : "The taste service is unavailable or rate limited. Wait a moment and try again. Your tastes have not been saved.",
      });
  }
}
