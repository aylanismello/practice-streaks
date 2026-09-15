export type FlowView = "closed" | "widget" | "full";

export function flowViewFromSearch(search: string): FlowView {
  const timer = new URLSearchParams(search).get("timer");
  if (timer === "full") return "full";
  if (timer === "widget") return "widget";
  return "closed";
}

export function hrefForFlowView(href: string, view: FlowView): string {
  const url = new URL(href);
  if (view === "closed") url.searchParams.delete("timer");
  else url.searchParams.set("timer", view);
  return `${url.pathname}${url.search}${url.hash}`;
}
