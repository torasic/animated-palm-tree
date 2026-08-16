'use client';

import React, { useEffect, useRef } from 'react';
import { select, min, max, scaleLinear, axisLeft, axisBottom, line, curveLinear, pointer } from 'd3';

interface CobwebChartProps {
  prices: number[];
  equilibriumPrice: number;
  height?: number;
}

export const CobwebChart: React.FC<CobwebChartProps> = ({
  prices,
  equilibriumPrice,
  height = 300
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || prices.length === 0) return;

    // Clear previous elements
    select(svgRef.current).selectAll("*").remove();

    const width = containerRef.current.clientWidth || 600;
    const margin = { top: 20, right: 30, bottom: 40, left: 65 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Map periods to indices
    const data = prices.map((p, idx) => ({
      period: idx,
      price: p
    }));

    // Domains
    const xDomain = [0, prices.length - 1];
    
    // Adjust yMin and yMax to make sure equilibrium line and prices fit
    const allPrices = [...prices, equilibriumPrice];
    const yMin = min(allPrices)! * 0.92;
    const yMax = max(allPrices)! * 1.08;

    const xScale = scaleLinear()
      .domain(xDomain)
      .range([0, innerWidth]);

    const yScale = scaleLinear()
      .domain([yMin, yMax])
      .range([innerHeight, 0]);

    // Trend color represents stability
    // If it diverges (last price difference from equilibrium is larger than first), use terracotta. Otherwise green.
    const firstDiff = Math.abs(prices[0] - equilibriumPrice);
    const lastDiff = Math.abs(prices[prices.length - 1] - equilibriumPrice);
    const isDivergent = lastDiff > firstDiff + 1.0; // small tolerance
    const chartColor = isDivergent ? 'var(--gr-down)' : 'var(--gr-up)';
    const shadowColor = isDivergent ? 'rgba(166, 64, 42, 0.2)' : 'rgba(47, 107, 63, 0.2)';

    // Draw Grid Lines (Y axis horizontal grid lines)
    svg.append("g")
      .attr("class", "grid-lines")
      .attr("opacity", 0.15)
      .call(axisLeft(yScale)
        .tickSize(-innerWidth)
        .tickFormat(() => "")
      )
      .selectAll("line")
      .attr("stroke", "var(--gr-line)");

    // Equilibrium Line (Dashed Reference Line)
    svg.append("line")
      .attr("x1", 0)
      .attr("y1", yScale(equilibriumPrice))
      .attr("x2", innerWidth)
      .attr("y2", yScale(equilibriumPrice))
      .attr("stroke", "var(--gr-ink-soft)")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,4")
      .attr("opacity", 0.6);

    // Label for Equilibrium
    svg.append("text")
      .attr("x", innerWidth - 5)
      .attr("y", yScale(equilibriumPrice) - 6)
      .attr("text-anchor", "end")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "8px")
      .attr("fill", "var(--gr-ink-soft)")
      .attr("opacity", 0.8)
      .text(`Ekuilibrium: Rp ${Math.round(equilibriumPrice).toLocaleString('id-ID')}`);

    // Draw Price Path Line
    const lineGenerator = line<any>()
      .x(d => xScale(d.period))
      .y(d => yScale(d.price))
      .curve(curveLinear);

    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", chartColor)
      .attr("stroke-width", 2.2)
      .attr("filter", `(0 0 5px ${shadowColor})`)
      .attr("d", lineGenerator);

    // Draw dots at each season point
    svg.selectAll(".dot")
      .data(data)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", d => xScale(d.period))
      .attr("cy", d => yScale(d.price))
      .attr("r", 3.5)
      .attr("fill", "var(--gr-paper)")
      .attr("stroke", chartColor)
      .attr("stroke-width", 1.8);

    // X Axis (Periods)
    const xAxis = svg.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .attr("opacity", 0.8)
      .call(axisBottom(xScale)
        .ticks(Math.min(10, prices.length))
        .tickFormat(d => `Musim ${d}`)
      );

    xAxis.selectAll("text")
      .attr("font-family", "var(--font-sans)")
      .attr("font-size", "9px")
      .attr("fill", "var(--gr-ink-soft)");

    xAxis.selectAll("line")
      .attr("stroke", "var(--gr-line)");
    
    xAxis.select(".domain")
      .attr("stroke", "var(--gr-line)");

    // Y Axis
    const yAxis = svg.append("g")
      .attr("opacity", 0.8)
      .call(axisLeft(yScale)
        .ticks(5)
        .tickFormat(d => `Rp ${d.toLocaleString('id-ID')}`)
      );

    yAxis.selectAll("text")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "9px")
      .attr("fill", "var(--gr-ink-soft)");

    yAxis.selectAll("line")
      .attr("stroke", "var(--gr-line)");

    yAxis.select(".domain")
      .attr("stroke", "var(--gr-line)");

    // Tooltip elements
    const focus = svg.append("g")
      .style("display", "none");

    focus.append("line")
      .attr("class", "x-hover-line hover-line")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "var(--gr-ink-soft)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0.4);

    focus.append("circle")
      .attr("r", 5)
      .attr("fill", chartColor)
      .attr("stroke", "var(--gr-paper)")
      .attr("stroke-width", 1.5);

    const tooltipCard = focus.append("g")
      .attr("class", "tooltip-card")
      .attr("transform", "translate(10,-35)");

    tooltipCard.append("rect")
      .attr("width", 110)
      .attr("height", 45)
      .attr("fill", "var(--gr-paper)")
      .attr("stroke", "var(--gr-line)")
      .attr("rx", 6)
      .attr("opacity", 0.95);

    const tooltipDate = tooltipCard.append("text")
      .attr("x", 8)
      .attr("y", 16)
      .attr("font-family", "var(--font-sans)")
      .attr("font-size", "9px")
      .attr("fill", "var(--gr-ink-soft)");

    const tooltipPrice = tooltipCard.append("text")
      .attr("x", 8)
      .attr("y", 32)
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "11px")
      .attr("font-weight", "bold")
      .attr("fill", chartColor);

    // Transparent overlay
    svg.append("rect")
      .attr("class", "overlay")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .on("mouseover", () => focus.style("display", null))
      .on("mouseout", () => focus.style("display", "none"))
      .on("mousemove", function(event) {
        const coords = pointer(event);
        const xVal = xScale.invert(coords[0]);
        const periodIdx = Math.max(0, Math.min(prices.length - 1, Math.round(xVal)));
        const d = data[periodIdx];

        focus.select("circle")
          .attr("cx", xScale(d.period))
          .attr("cy", yScale(d.price));

        focus.select(".x-hover-line")
          .attr("x1", xScale(d.period))
          .attr("x2", xScale(d.period));

        tooltipDate.text(`Proyeksi Musim ${d.period}`);
        tooltipPrice.text(`Rp ${Math.round(d.price).toLocaleString('id-ID')}`);

        const cardX = xScale(d.period) + 15 > innerWidth - 110 ? xScale(d.period) - 125 : xScale(d.period) + 15;
        const cardY = yScale(d.price) - 20;
        tooltipCard.attr("transform", `translate(${cardX}, ${cardY})`);
      });

  }, [prices, equilibriumPrice, height]);

  return (
    <div ref={containerRef} className="w-full relative">
      <svg ref={svgRef} className="mx-auto block overflow-visible"></svg>
    </div>
  );
};
