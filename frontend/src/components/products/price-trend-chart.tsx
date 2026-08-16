'use client';

import React, { useEffect, useRef } from 'react';
import { select, extent, min, max, scaleTime, scaleLinear, axisLeft, axisBottom, area, curveMonotoneX, line, timeDay, timeFormat, pointer, bisector } from 'd3';

interface PriceTrendChartProps {
  data: Array<{ scraped_at: string; price_per_kg: number }>;
  height?: number;
}

export const PriceTrendChart: React.FC<PriceTrendChartProps> = ({
  data,
  height = 350
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length < 2) return;

    // Clear previous elements
    select(svgRef.current).selectAll("*").remove();

    // Get width dynamically from container
    const width = containerRef.current.clientWidth || 600;
    const margin = { top: 20, right: 30, bottom: 40, left: 65 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = select(svgRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", "100%")
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Parse dates and prices
    const parsedData = data.map(d => ({
      date: new Date(d.scraped_at),
      price: d.price_per_kg
    })).sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate trend direction (isUptrend = price_last >= price_first)
    const isUptrend = parsedData[parsedData.length - 1].price >= parsedData[0].price;
    const trendColor = isUptrend ? 'var(--gr-up)' : 'var(--gr-down)';
    const trendShadow = isUptrend ? 'rgba(47, 107, 63, 0.2)' : 'rgba(166, 64, 42, 0.2)';

    // Scale domains
    const xDomain = extent(parsedData, d => d.date) as [Date, Date];
    const yMin = min(parsedData, d => d.price)! * 0.95;
    const yMax = max(parsedData, d => d.price)! * 1.05;

    const xScale = scaleTime()
      .domain(xDomain)
      .range([0, innerWidth]);

    const yScale = scaleLinear()
      .domain([yMin, yMax])
      .range([innerHeight, 0]);

    // Create Gradient for Area
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
      .attr("id", "area-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    gradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", trendColor)
      .attr("stop-opacity", 0.25);

    gradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", trendColor)
      .attr("stop-opacity", 0);

    // Draw Grid Lines (Y axis horizontal grid lines)
    svg.append("g")
      .attr("class", "grid-lines")
      .attr("opacity", 0.2)
      .call(axisLeft(yScale)
        .tickSize(-innerWidth)
        .tickFormat(() => "")
      )
      .selectAll("line")
      .attr("stroke", "var(--gr-line)");

    // Draw Area under the line
    const areaGenerator = area<any>()
      .x(d => xScale(d.date))
      .y0(innerHeight)
      .y1(d => yScale(d.price))
      .curve(curveMonotoneX);

    svg.append("path")
      .datum(parsedData)
      .attr("fill", "url(#area-gradient)")
      .attr("d", areaGenerator);

    // Draw Line
    const lineGenerator = line<any>()
      .x(d => xScale(d.date))
      .y(d => yScale(d.price))
      .curve(curveMonotoneX);

    svg.append("path")
      .datum(parsedData)
      .attr("fill", "none")
      .attr("stroke", trendColor)
      .attr("stroke-width", 2.5)
      .attr("filter", `(0 0 6px ${trendShadow})`)
      .attr("d", lineGenerator);

    // Calculate tick interval in days to prevent sub-day ticks and duplicates
    const dateRangeDays = Math.max(1, Math.round((xDomain[1].getTime() - xDomain[0].getTime()) / (1000 * 60 * 60 * 24)));
    const tickInterval = Math.max(1, Math.floor(dateRangeDays / 6));

    // X Axis
    const xAxis = svg.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .attr("opacity", 0.8)
      .call(axisBottom(xScale)
        .ticks(timeDay.every(tickInterval))
        .tickFormat(timeFormat("%d %b") as any)
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
      .attr("fill", trendColor)
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
      .attr("fill", trendColor);

    // Transparent overlay to capture hovers
    svg.append("rect")
      .attr("class", "overlay")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .on("mouseover", () => focus.style("display", null))
      .on("mouseout", () => focus.style("display", "none"))
      .on("mousemove", function(event) {
        const x0 = xScale.invert(pointer(event)[0]);
        const bisect = bisector<any, Date>(d => d.date).left;
        const i = bisect(parsedData, x0, 1);
        const d0 = parsedData[i - 1];
        const d1 = parsedData[i];
        if (!d0) return;
        const d = !d1 || (x0.getTime() - d0.date.getTime() < d1.date.getTime() - x0.getTime()) ? d0 : d1;

        focus.select("circle")
          .attr("cx", xScale(d.date))
          .attr("cy", yScale(d.price));

        focus.select(".x-hover-line")
          .attr("x1", xScale(d.date))
          .attr("x2", xScale(d.date));

        // Format dates beautifully
        const fmtDate = timeFormat("%d %B %Y")(d.date);
        tooltipDate.text(fmtDate);
        tooltipPrice.text(`Rp ${d.price.toLocaleString('id-ID')}`);

        // Prevent tooltip card overflow
        const cardX = xScale(d.date) + 15 > innerWidth - 110 ? xScale(d.date) - 125 : xScale(d.date) + 15;
        const cardY = yScale(d.price) - 20;
        tooltipCard.attr("transform", `translate(${cardX}, ${cardY})`);
      });

  }, [data, height]);

  return (
    <div ref={containerRef} className="w-full relative">
      <svg ref={svgRef} className="mx-auto block overflow-visible"></svg>
    </div>
  );
};
