'use client';

import { useEffect, useRef } from 'react';

/**
 * An animated wireframe globe rendered with Canvas 2D.
 * Inspired by the parse.bot hero globe — black lines on transparent bg, slowly rotating.
 */
export default function WireframeGlobe({ size = 320, strokeColor = 'currentColor', strokeWidth = 0.8 }) {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);

        const cx = size / 2;
        const cy = size / 2;
        const r = size / 2 - 4;

        let angle = 0;

        const draw = () => {
            ctx.clearRect(0, 0, size, size);

            // Use CSS computed color
            const computedColor = getComputedStyle(canvas).color || strokeColor;
            ctx.strokeStyle = computedColor;
            ctx.lineWidth = strokeWidth;

            // Outer circle
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();

            // Horizontal lines (latitudes)
            const latCount = 7;
            for (let i = 1; i < latCount; i++) {
                const frac = (i / latCount) * 2 - 1; // -1 to 1
                const y = cy + frac * r;
                const rx = Math.sqrt(r * r - (frac * r) * (frac * r));
                ctx.beginPath();
                ctx.ellipse(cx, y, rx, 0, 0, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Vertical lines (longitudes) — these rotate
            const lonCount = 8;
            for (let i = 0; i < lonCount; i++) {
                const lonAngle = (i / lonCount) * Math.PI + angle;
                const rx = Math.abs(Math.cos(lonAngle)) * r;

                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, r, 0, 0, Math.PI * 2);
                ctx.stroke();
            }

            angle += 0.004;
            animationRef.current = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [size, strokeColor, strokeWidth]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: size,
                height: size,
                color: strokeColor,
            }}
            aria-label="Animated wireframe globe"
        />
    );
}
