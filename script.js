
const state = {
  metric: "rel_attend",     
  sector: "all",            
  tiers: new Set(),         
  brushed: null,            
  pinned: new Set(),        
  hovered: null,            
};

const LOW = "0-20";        
const HIGH = "Top 1";      

const tierColor = d3.scaleOrdinal()
  .range(["#b91c1c", "#1d4ed8", "#0f766e", "#7e22ce", "#b45309", "#475569"]);

d3.csv("data/CollegeAdmissions_Data.csv", d3.autoType).then(rows => {
  const colleges = Array.from(d3.group(rows, d => d.name), ([name, vals]) => {
    vals.sort((a, b) => a.par_income_bin - b.par_income_bin);
    return {
      name,
      tier: vals[0].tier_name,
      sector: vals[0].public,
      values: vals,
    };
  });

  const incomeLabels = colleges[0].values.map(d => d.par_income_lab);
  const tiers = Array.from(new Set(colleges.map(c => c.tier))).sort();
  tierColor.domain(tiers);
  tiers.forEach(t => state.tiers.add(t));

  buildControls(tiers);

  const line = setupLine(incomeLabels);
  const scatter = setupScatter();
  const valueAt = (c, label) => c.values.find(v => v.par_income_lab === label)[state.metric];
  const visible = c =>
    valueAt(c, LOW) > 0 && valueAt(c, HIGH) > 0 && 
    state.tiers.has(c.tier) &&
    (state.sector === "all" || c.sector === state.sector);

  function update() {
    const shown = colleges.filter(visible);
    const allVals = colleges.flatMap(c => c.values.map(v => v[state.metric])).filter(v => v > 0);
    const yMax = d3.max(allVals) * 1.1;
    line.y.domain([Math.max(0.05, d3.min(allVals) * 0.9), yMax]);
    scatter.x.domain(line.y.domain());
    scatter.y.domain(line.y.domain());

    drawLine(line, shown);
    drawScatter(scatter, shown);
    applyHighlights(line, scatter);
  }

// =====================================================================
// Line Chart
// =====================================================================
  function drawLine(chart, shown) {
    const { g, x, y, path } = chart;

    g.select(".y-axis").transition().duration(400)
      .call(d3.axisLeft(y).ticks(8, "~g"));
    g.select(".ref-line")
      .transition().duration(400)
      .attr("y1", y(1)).attr("y2", y(1));
    g.select(".ref-label").attr("y", y(1) - 4);

    const sel = g.select(".lines").selectAll(".college-line")
      .data(shown, d => d.name);

    sel.join(
      enter => enter.append("path")
        .attr("class", "college-line")
        .attr("stroke", d => tierColor(d.tier))
        .attr("d", d => path(d.values.map(v => [v.par_income_lab, v[state.metric]])))
        .on("mouseenter", (event, d) => { state.hovered = d.name; showTip(event, d); applyHighlights(line, scatter); })
        .on("mousemove", (event, d) => moveTip(event))
        .on("mouseleave", () => { state.hovered = null; hideTip(); applyHighlights(line, scatter); })
        .on("click", (event, d) => togglePin(d.name)),
      update => update,
      exit => exit.remove()
    )
    .transition().duration(400)
    .attr("d", d => path(d.values.map(v => [v.par_income_lab, v[state.metric]])));
  }

// =====================================================================
// Scatter CHart
// =====================================================================
  function drawScatter(chart, shown) {
    const { g, x, y } = chart;
    g.select(".x-axis").transition().duration(400).call(d3.axisBottom(x).ticks(6, "~g"));
    g.select(".y-axis").transition().duration(400).call(d3.axisLeft(y).ticks(6, "~g"));
    const [lo, hi] = x.domain();
    g.select(".diagonal")
      .transition().duration(400)
      .attr("x1", x(lo)).attr("y1", y(lo)).attr("x2", x(hi)).attr("y2", y(hi));

    g.select(".dots").selectAll(".dot")
      .data(shown, d => d.name)
      .join(
        enter => enter.append("circle")
          .attr("class", "dot")
          .attr("r", 5)
          .attr("fill", d => tierColor(d.tier))
          .on("mouseenter", (event, d) => { state.hovered = d.name; showTip(event, d); applyHighlights(line, scatter); })
          .on("mousemove", (event) => moveTip(event))
          .on("mouseleave", () => { state.hovered = null; hideTip(); applyHighlights(line, scatter); })
          .on("click", (event, d) => togglePin(d.name)),
        update => update,
        exit => exit.remove()
      )
      .transition().duration(400)
      .attr("cx", d => x(valueAt(d, LOW)))
      .attr("cy", d => y(valueAt(d, HIGH)));
  }

  function applyHighlights() {
    const focus = new Set([...state.pinned]);
    if (state.hovered) focus.add(state.hovered);
    const hasBrush = state.brushed && state.brushed.size > 0;
    const hasFocus = hasBrush || focus.size > 0;

    const isOn = d => !hasFocus || focus.has(d.name) || (hasBrush && state.brushed.has(d.name));

    line.g.selectAll(".college-line")
      .classed("dim", d => !isOn(d))
      .classed("hover", d => d.name === state.hovered)
      .classed("pinned", d => state.pinned.has(d.name))
      .filter(d => isOn(d) && hasFocus).raise();
    scatter.g.selectAll(".dot")
      .classed("dim", d => !isOn(d))
      .attr("r", d => (d.name === state.hovered || state.pinned.has(d.name)) ? 8 : 5);
  }

  function togglePin(name) {
    state.pinned.has(name) ? state.pinned.delete(name) : state.pinned.add(name);
    applyHighlights();
  }

// =====================================================================
// Brush and misc
// =====================================================================
  const brush = d3.brush()
    .extent([[0, 0], [scatter.w, scatter.h]])
    .on("brush end", ({ selection }) => {
      if (!selection) { state.brushed = null; applyHighlights(); return; }
      const [[x0, y0], [x1, y1]] = selection;
      state.brushed = new Set(
        colleges.filter(visible).filter(c => {
          const cx = scatter.x(valueAt(c, LOW)), cy = scatter.y(valueAt(c, HIGH));
          return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
        }).map(c => c.name)
      );
      applyHighlights();
    });
  scatter.g.select(".brush-layer").call(brush);
  // keep dots on top of the brush overlay so hover/click still work
  scatter.g.select(".dots").raise();

// =====================================================================
// Control stuff
// =====================================================================
  d3.select("#metric").on("change", e => { state.metric = e.target.value; update(); });
  d3.select("#sector").on("change", e => { state.sector = e.target.value; state.brushed = null; clearBrush(); update(); });
  d3.select("#reset").on("click", () => {
    state.pinned.clear(); state.brushed = null; clearBrush();
    tiers.forEach(t => state.tiers.add(t));
    d3.selectAll("#tier-filters input").property("checked", true);
    update();
  });
  function clearBrush() { scatter.g.select(".brush-layer").call(brush.move, null); }

  function buildControls(tiers) {
    const lab = d3.select("#tier-filters").selectAll("label").data(tiers).join("label");
    lab.append("input").attr("type", "checkbox").property("checked", true)
      .on("change", (e, t) => {
        e.target.checked ? state.tiers.add(t) : state.tiers.delete(t);
        update();
      });
    lab.append("span").attr("class", "swatch").style("background", t => tierColor(t));
    lab.append("span").text(t => t);
  }

// =====================================================================
// ToolTIP
// =====================================================================
  const tip = d3.select("#tooltip");
  function showTip(event, d) {
    const lo = valueAt(d, LOW).toFixed(2), hi = valueAt(d, HIGH).toFixed(2);
    tip.html(`<strong>${d.name}</strong><br>${d.tier} (${d.sector})<br>
      Bottom 20%: ${lo}&times;<br>Top 1%: ${hi}&times;`).attr("hidden", null);
    moveTip(event);
  }
  function moveTip(event) {
    tip.style("left", (event.clientX + 14) + "px").style("top", (event.clientY + 14) + "px");
  }
  function hideTip() { tip.attr("hidden", true); }

  update();
});

// =====================================================================
// Chart axes, labels, groups
// =====================================================================
function setupLine(labels) {
  const W = 720, H = 460, m = { t: 20, r: 20, b: 70, l: 55 };
  const w = W - m.l - m.r, h = H - m.t - m.b;
  const svg = d3.select("#line-chart").attr("viewBox", `0 0 ${W} ${H}`);
  const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

  const x = d3.scalePoint().domain(labels).range([0, w]);
  const y = d3.scaleLog().range([h, 0]);

  g.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x))
    .selectAll("text").attr("transform", "rotate(-35)").style("text-anchor", "end");
  g.append("g").attr("class", "axis y-axis");
  g.append("text").attr("class", "axis-label").attr("x", w / 2).attr("y", h + 62)
    .attr("text-anchor", "middle").text("Parent income percentile");
  g.append("text").attr("class", "axis-label").attr("transform", "rotate(-90)")
    .attr("x", -h / 2).attr("y", -42).attr("text-anchor", "middle")
    .text("Rate relative to average (log scale)");
  g.append("line").attr("class", "ref-line").attr("x1", 0).attr("x2", w);
  g.append("text").attr("class", "ref-label").attr("x", 4).text("average = 1.0");
  g.append("g").attr("class", "lines");

  const path = d3.line().defined(d => d[1] > 0).x(d => x(d[0])).y(d => y(Math.max(d[1], y.domain()[0])));
  return { g, x, y, path, w, h };
}

function setupScatter() {
  const W = 480, H = 460, m = { t: 20, r: 20, b: 55, l: 55 };
  const w = W - m.l - m.r, h = H - m.t - m.b;
  const svg = d3.select("#scatter-chart").attr("viewBox", `0 0 ${W} ${H}`);
  const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

  const x = d3.scaleLog().range([0, w]);
  const y = d3.scaleLog().range([h, 0]);

  g.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${h})`);
  g.append("g").attr("class", "axis y-axis");
  g.append("text").attr("class", "axis-label").attr("x", w / 2).attr("y", h + 42)
    .attr("text-anchor", "middle").text("Bottom 20% of parent income");
  g.append("text").attr("class", "axis-label").attr("transform", "rotate(-90)")
    .attr("x", -h / 2).attr("y", -42).attr("text-anchor", "middle")
    .text("Top 1% of parent income");
  g.append("line").attr("class", "ref-line diagonal");
  g.append("g").attr("class", "brush-layer");
  g.append("g").attr("class", "dots");
  return { g, x, y, w, h };
}
