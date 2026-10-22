/** Splits a server-sent event stream into the data of each complete frame. What follows the last blank line stays in `rest`. */
export function takeFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;
  for (let end = rest.indexOf("\n\n"); end >= 0; end = rest.indexOf("\n\n")) {
    const data = rest
      .slice(0, end)
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (data) frames.push(data);
    rest = rest.slice(end + 2);
  }
  return { frames, rest };
}
