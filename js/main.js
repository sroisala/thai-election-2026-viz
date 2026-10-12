// Demo chart — replace data/sample_party_seats.json with real ECT data.
const margin = { top: 16, right: 48, bottom: 24, left: 90 };
const width = 900, height = 320;

const svg = d3.select("#chart").append("svg")
  .attr("viewBox", `0 0 ${width} ${height}`);
const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
const innerW = width - margin.left - margin.right;
const innerH = height - margin.top - margin.bottom;
const x = d3.scaleLinear().range([0, innerW]);
const y = d3.scaleBand().range([0, innerH]).padding(0.25);
const xAxis = g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`);
const yAxis = g.append("g").attr("class", "axis");
const tooltip = d3.select("#tooltip");

d3.json("data/sample_party_seats.json").then(({ parties }) => {
  parties.forEach(d => d.total = d.constituency + d.list);
  const render = (key) => {
    const data = [...parties].sort((a, b) => b[key] - a[key]);
    x.domain([0, d3.max(data, d => d[key])]).nice();
    y.domain(data.map(d => d.party));
    xAxis.transition().call(d3.axisBottom(x).ticks(6));
    yAxis.transition().call(d3.axisLeft(y).tickSize(0)).selectAll("text").attr("dx", "-6");

    g.selectAll(".bar").data(data, d => d.party).join("rect")
      .attr("class", "bar").attr("rx", 3)
      .on("mousemove", (e, d) => {
        const [mx, my] = d3.pointer(e, document.querySelector(".card"));
        tooltip.attr("hidden", null)
          .style("left", `${mx + 12}px`).style("top", `${my - 10}px`)
          .html(`<strong>${d.party}</strong><br>Constituency ${d.constituency} · List ${d.list} · Total ${d.total}`);
      })
      .on("mouseleave", () => tooltip.attr("hidden", true))
      .transition().duration(500)
      .attr("x", 0).attr("y", d => y(d.party))
      .attr("height", y.bandwidth()).attr("width", d => x(d[key]));

    g.selectAll(".label").data(data, d => d.party).join("text")
      .attr("class", "label").attr("dy", "0.35em")
      .transition().duration(500)
      .attr("x", d => x(d[key]) + 6).attr("y", d => y(d.party) + y.bandwidth() / 2)
      .text(d => d[key]);
  };
  render("total");
  d3.select("#seatType").on("change", e => render(e.target.value));
});
