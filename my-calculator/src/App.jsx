import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Minus, Move, Download, Save, FolderOpen, Target, Sigma, Sun, Moon, Spline, GitCommit, ArrowUp, ArrowDown, UnfoldVertical, XCircle, ChevronUp, ChevronDown, TrendingUp } from 'lucide-react';
import * as mathjs from 'mathjs'; // Use the locally installed mathjs library

// --- Numerical Analysis Helpers ---

const calculateDerivative = (func, x, h = 1e-7) => {
    const f_x = func(x);
    if (!isFinite(f_x)) return { value: NaN, left: NaN, right: NaN };

    const f_xh_plus = func(x + h);
    const f_xh_minus = func(x - h);

    if (!isFinite(f_xh_plus) || !isFinite(f_xh_minus)) {
         return { value: NaN, left: NaN, right: NaN };
    }

    const rightDerivative = (f_xh_plus - f_x) / h;
    const leftDerivative = (f_x - f_xh_minus) / h;

    // Check for non-differentiability (e.g., sharp corners in abs(x))
    if (Math.abs(rightDerivative - leftDerivative) > 1e-3) {
        return { value: NaN, left: leftDerivative, right: rightDerivative };
    }

    // Use a more accurate central difference formula when differentiable
    const centralDerivative = (f_xh_plus - f_xh_minus) / (2 * h);
    return { value: centralDerivative, left: leftDerivative, right: rightDerivative };
};


const findRoot = (func, a, b, tolerance = 1e-7, maxIter = 100) => {
    let fa = func(a);
    let fb = func(b);
    if (isNaN(fa) || isNaN(fb) || fa * fb >= 0) return null;

    let c;
    for (let i = 0; i < maxIter; i++) {
        c = (a + b) / 2;
        let fc = func(c);
        if (isNaN(fc)) return null;
        if (Math.abs(fc) < tolerance || (b - a) / 2 < tolerance) return c;
        if (fa * fc < 0) { b = c; fb = fc; }
        else { a = c; fa = fc; }
    }
    return c;
};

const scanForRoots = (func, xMin, xMax, steps = 2000) => {
    const roots = [];
    const stepSize = (xMax - xMin) / steps;
    let lastY = func(xMin);

    for (let i = 1; i <= steps; i++) {
        const x = xMin + i * stepSize;
        const y = func(x);
        if (!isFinite(y) || !isFinite(lastY)) {
            lastY = y;
            continue;
        }
        if (lastY * y < 0) {
            const root = findRoot(func, x - stepSize, x);
            if (root !== null && !roots.some(r => Math.abs(r - root) < 1e-5)) {
                roots.push(root);
            }
        }
        lastY = y;
    }
    return roots;
};

const calculateIntegral = (func, a, b, n = 1000) => {
    if (typeof a !== 'number' || typeof b !== 'number' || !isFinite(a) || !isFinite(b)) return NaN;
    const h = (b - a) / n;
    let sum = 0;
    try {
        const startVal = func(a);
        const endVal = func(b);
        if(!isFinite(startVal) || !isFinite(endVal)) return NaN;
        sum = 0.5 * (startVal + endVal);
        for (let i = 1; i < n; i++) {
            const val = func(a + i * h);
            if (!isFinite(val)) continue;
            sum += val;
        }
    } catch(e) { return NaN; }
    return h * sum;
};

// --- React Components ---

const Tooltip = ({ children, text }) => (
    <div className="relative flex items-center group">
        {children}
        <div className="absolute bottom-full mb-2 w-max bg-gray-700 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-50">
            {text}
        </div>
    </div>
);

const NumberInputWithSteppers = ({ value, onChange, step = 1, label }) => {
    const handleStep = (direction) => {
        const numericValue = parseFloat(value) || 0;
        const newValue = direction === 'up' ? numericValue + step : numericValue - step;
        const precision = Math.max((step.toString().split('.')[1] || '').length, (value.toString().split('.')[1] || '').length);
        onChange(parseFloat(newValue.toFixed(precision)));
    };

    return (
        <div className="relative w-full">
            {label && <label className="text-xs absolute -top-2 left-2 bg-gray-50 dark:bg-gray-800 px-1 text-gray-500">{label}</label>}
            <input
                type="text"
                value={value}
                onChange={(e) => {
                    const sanitizedValue = e.target.value.replace(/[^0-9.-]/g, '');
                    onChange(sanitizedValue);
                }}
                onBlur={(e) => {
                    const parsed = parseFloat(e.target.value);
                    onChange(isNaN(parsed) ? 0 : parsed);
                }}
                className={`w-full p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:ring-blue-500 text-center pr-6 ${label ? 'pt-3' : ''}`}
            />
            <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center">
                <button onClick={() => handleStep('up')} className="h-1/2 px-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"><ChevronUp size={14} /></button>
                <button onClick={() => handleStep('down')} className="h-1/2 px-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"><ChevronDown size={14} /></button>
            </div>
        </div>
    );
};

const GraphCanvas = ({ equations, view, setView, settings, darkMode, math, analysis }) => {
    const canvasRef = useRef(null);
    const [mouseSnap, setMouseSnap] = useState(null);
    const isPanning = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !math) return;
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);

        const { xMin, xMax, yMin, yMax } = view;
        const toScreenX = (x) => (x - xMin) / (xMax - xMin) * width;
        const toScreenY = (y) => height - (y - yMin) / (yMax - yMin) * height;
        const toWorldX = (px) => (px / width) * (xMax - xMin) + xMin;
        
        const bgColor = darkMode ? '#1f2937' : '#ffffff';
        const gridColor = darkMode ? '#4b5563' : '#d1d5db';
        const axisColor = darkMode ? '#9ca3af' : '#6b7281';

        ctx.fillStyle = bgColor;
        ctx.fillRect(0,0,width,height);
        
        if (settings.showGrid) {
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = 0.5;
            const xStep = Math.pow(10, Math.floor(Math.log10(xMax - xMin)) - 1);
            const yStep = Math.pow(10, Math.floor(Math.log10(yMax - yMin)) - 1);

            for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
                ctx.beginPath();
                ctx.moveTo(toScreenX(x), 0);
                ctx.lineTo(toScreenX(x), height);
                ctx.stroke();
            }
            for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
                ctx.beginPath();
                ctx.moveTo(0, toScreenY(y));
                ctx.lineTo(width, toScreenY(y));
                ctx.stroke();
            }
        }
        
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, toScreenY(0)); ctx.lineTo(width, toScreenY(0)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(toScreenX(0), 0); ctx.lineTo(toScreenX(0), height); ctx.stroke();

        if (analysis.mode === 'integral' && analysis.results.integral) {
            const eq = equations.find(e => e.id === analysis.params.integralId);
            if (eq) {
                const compiledEq = math.parse(eq.text).compile();
                const { a, b } = analysis.params;
                ctx.fillStyle = `${eq.color}40`;
                ctx.beginPath();
                ctx.moveTo(toScreenX(a), toScreenY(0));
                for(let x = Math.min(a,b); x <= Math.max(a,b); x += (xMax - xMin) / width) {
                     const y = compiledEq.evaluate({ x });
                     if (isFinite(y)) ctx.lineTo(toScreenX(x), toScreenY(y));
                }
                ctx.lineTo(toScreenX(b), toScreenY(0));
                ctx.closePath();
                ctx.fill();
            }
        }

        // --- Draw Equations ---
        equations.forEach(eq => {
             if (!eq.text || !eq.visible) return;
             try {
                const code = math.parse(eq.text).compile();
                ctx.strokeStyle = eq.color;
                ctx.lineWidth = 2;
                ctx.beginPath();

                let lastY_world = NaN;

                for (let px = 0; px <= width; px++) {
                    const x = toWorldX(px);
                    const y = code.evaluate({ x });

                    if (isFinite(y)) {
                        if (isNaN(lastY_world)) {
                            ctx.moveTo(px, toScreenY(y));
                        } else {
                            const yChange = y - lastY_world;
                            const crossedAsymptote = Math.sign(y) * Math.sign(lastY_world) === -1 && Math.abs(yChange) > (yMax - yMin) * 0.5;
                            const isIntegerJump = Math.abs(yChange - Math.round(yChange)) < 1e-9 && Math.round(yChange) !== 0;

                            if (crossedAsymptote && !isIntegerJump) {
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(px, toScreenY(y));
                            } else if (isIntegerJump) {
                                ctx.lineTo(px, toScreenY(lastY_world));
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(px, toScreenY(y));
                            } else {
                                ctx.lineTo(px, toScreenY(y));
                            }
                        }
                        lastY_world = y;
                    } else {
                        if (!isNaN(lastY_world)) {
                            ctx.stroke();
                        }
                        ctx.beginPath();
                        lastY_world = NaN;
                    }
                }
                ctx.stroke();
            } catch (e) {/* silent */}
        });
        
        // --- Draw Analysis Points ---
        const { results } = analysis;
        results.intersections.forEach(p => {
            ctx.fillStyle = '#db2777';
            ctx.beginPath(); ctx.arc(toScreenX(p.x), toScreenY(p.y), 6, 0, 2 * Math.PI); ctx.fill();
            ctx.strokeStyle = darkMode ? '#f9fafb' : '#11182c'; ctx.lineWidth = 1.5; ctx.stroke();
        });
        const drawExtremaPoint = (p, color) => {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(toScreenX(p.x), toScreenY(p.y), 5, 0, 2 * Math.PI); ctx.fill();
        };
        results.extrema.max.forEach(p => drawExtremaPoint(p, '#16a34a'));
        results.extrema.min.forEach(p => drawExtremaPoint(p, '#dc2626'));
        results.extrema.inflection.forEach(p => drawExtremaPoint(p, '#f59e0b'));
        
        // --- Draw Derivative Point and Tangent Line ---
        if (analysis.mode === 'derivative' && analysis.results.derivative) {
            const { x, y, tangent } = analysis.results.derivative;
            const sx = toScreenX(x);
            const sy = toScreenY(y);

            if(isFinite(sx) && isFinite(sy)){
                ctx.fillStyle = '#f59e0b'; // Amber
                ctx.beginPath();
                ctx.arc(sx, sy, 6, 0, 2 * Math.PI);
                ctx.fill();
                ctx.strokeStyle = darkMode ? '#f9fafb' : '#11182c';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            if (tangent) {
                const { slope, x0, y0 } = tangent;
                const tangentFunc = (tx) => slope * (tx - x0) + y0;

                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();

                const startY = tangentFunc(xMin);
                const endY = tangentFunc(xMax);

                ctx.moveTo(toScreenX(xMin), toScreenY(startY));
                ctx.lineTo(toScreenX(xMax), toScreenY(endY));
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

    }, [view, equations, settings, darkMode, math, analysis]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const resizeObserver = new ResizeObserver(() => {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            draw();
        });
        resizeObserver.observe(canvas);
        canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
        return () => { resizeObserver.disconnect(); };
    }, [draw]);
    
    useEffect(draw, [draw]);

    const toWorldX = (px) => (px / canvasRef.current.width) * (view.xMax - view.xMin) + view.xMin;
    const toWorldY = (py) => ((canvasRef.current.height - py) / canvasRef.current.height) * (view.yMax - view.yMin) + view.yMin;

    const handleMouseDown = (e) => {
        isPanning.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        canvasRef.current.style.cursor = 'grabbing';
    };

    const handleMouseUp = () => {
        isPanning.current = false;
        canvasRef.current.style.cursor = 'crosshair';
    };
    
    const handleMouseLeave = () => {
        isPanning.current = false;
        setMouseSnap(null);
        canvasRef.current.style.cursor = 'crosshair';
    };

    const handleMouseMove = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (isPanning.current) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            
            const worldDx = (dx / canvas.width) * (view.xMax - view.xMin);
            const worldDy = (dy / canvas.height) * (view.yMax - view.yMin);

            setView(prev => ({
                xMin: prev.xMin - worldDx,
                xMax: prev.xMax - worldDx,
                yMin: prev.yMin + worldDy,
                yMax: prev.yMax + worldDy,
            }));
            return;
        }

        if (!math || !equations.length) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const worldX = toWorldX(mouseX);
        const worldY = toWorldY(e.clientY - rect.top);

        let bestSnap = null;
        let minDistance = 0.05 * (view.yMax - view.yMin);

        equations.filter(eq => eq.visible && eq.text).forEach(eq => {
            try {
                const y = math.parse(eq.text).compile().evaluate({ x: worldX });
                const distance = Math.abs(y - worldY);
                if (isFinite(y) && distance < minDistance) {
                    minDistance = distance;
                    bestSnap = { x: worldX, y, color: eq.color, sx: mouseX, sy: e.clientY - rect.top };
                }
            } catch (e) {/* silent */}
        });
        setMouseSnap(bestSnap);
    };
    
    const handleWheel = (e) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const worldX = toWorldX(mouseX);
        const worldY = toWorldY(e.clientY - rect.top);
        
        const zoomFactor = e.deltaY < 0 ? 0.8 : 1.25;

        setView(prev => ({
            xMin: worldX + (prev.xMin - worldX) * zoomFactor,
            xMax: worldX + (prev.xMax - worldX) * zoomFactor,
            yMin: worldY + (prev.yMin - worldY) * zoomFactor,
            yMax: worldY + (prev.yMax - worldY) * zoomFactor,
        }));
    };

    return (
        <div className="w-full h-full relative bg-white dark:bg-gray-800 rounded-lg shadow-inner">
            <canvas 
                ref={canvasRef} 
                className="w-full h-full cursor-crosshair" 
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove} 
                onMouseLeave={handleMouseLeave}
                onWheel={handleWheel}
            />
            {mouseSnap && !isPanning.current && (
                <div className="absolute p-2 text-white text-xs rounded-md pointer-events-none" style={{
                    left: mouseSnap.sx + 15,
                    top: mouseSnap.sy,
                    transform: 'translateY(-50%)',
                    backgroundColor: mouseSnap.color,
                }}>
                    X: {mouseSnap.x.toFixed(3)}<br /> Y: {mouseSnap.y.toFixed(3)}
                </div>
            )}
        </div>
    );
};

const ControlsPanel = ({ equations, setEquations, view, setView, settings, setSettings, darkMode, setDarkMode, runAnalysis, math, mathLoaded, analysis, setAnalysisParams }) => {
    const fileInputRef = useRef(null);

    const addEquation = () => setEquations([...equations, { id: Date.now(), text: '', color: `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`, visible: true }]);
    const updateEquation = (id, field, value) => setEquations(equations.map(eq => eq.id === id ? { ...eq, [field]: value } : eq));
    const removeEquation = (id) => setEquations(equations.filter(eq => eq.id !== id));
    
    const addDerivative = (eq) => {
        if (!math || !eq.text) return;
        try {
            const derivText = math.derivative(eq.text, 'x').toString();
            const newColor = `#${(parseInt(eq.color.substring(1), 16) ^ 0xcccccc).toString(16).padStart(6, '0')}`;
            setEquations([...equations, { id: Date.now(), text: derivText, color: newColor, visible: true, }]);
        } catch (error) { alert(`Could not calculate derivative: ${error.message}`); }
    };

    const handleSave = () => {
        if (window.javaBridge) {
            const workspace = { equations, view, settings };
            const content = JSON.stringify(workspace, null, 2);
            const fileName = "graph-workspace.json";
            window.javaBridge.saveFile(content, fileName);
        } else {
            alert("Save Error: The Java bridge is not connected.");
        }
    };
    
    const handleLoadClick = () => fileInputRef.current.click();
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const loadedWorkspace = JSON.parse(e.target.result);
                if (loadedWorkspace.equations && loadedWorkspace.view && loadedWorkspace.settings) {
                    setEquations(loadedWorkspace.equations);
                    setView(loadedWorkspace.view);
                    setSettings(loadedWorkspace.settings);
                } else { alert("Invalid workspace file."); }
            } catch (error) { alert("Error reading file: " + error.message); }
        };
        reader.readAsText(file);
        event.target.value = null;
    };
    
    const handleExportSVG = () => {
        if (window.javaBridge) {
            const { width, height } = document.querySelector('canvas') || {width: 800, height: 600};

            if (!math) {
                alert("Math library not ready. Please wait a moment and try again.");
                return;
            }

            const { xMin, xMax, yMin, yMax } = view;
            const toScreenX = (x) => (x - xMin) / (xMax - xMin) * width;
            const toScreenY = (y) => height - (y - yMin) / (yMax - yMin) * height;

            let svgPaths = equations.map(eq => {
                if (!eq.text || !eq.visible) return '';
                try {
                    const code = math.parse(eq.text).compile();
                    let d = '';
                    let lastY_world = NaN;

                    for (let px = 0; px <= width; px++) {
                        const x = (px / width) * (xMax - xMin) + xMin;
                        const y = code.evaluate({ x: x });

                        if (isFinite(y)) {
                            const sy = toScreenY(y);
                            if (isNaN(lastY_world)) {
                                d += `M ${px.toFixed(2)},${sy.toFixed(2)} `;
                            } else {
                                const yChange = y - lastY_world;
                                const crossedAsymptote = Math.sign(y) * Math.sign(lastY_world) === -1 && Math.abs(yChange) > (yMax - yMin) * 0.5;
                                const isIntegerJump = Math.abs(yChange - Math.round(yChange)) < 1e-9 && Math.round(yChange) !== 0;

                                if (crossedAsymptote && !isIntegerJump) {
                                     d += `M ${px.toFixed(2)},${sy.toFixed(2)} `;
                                } else if (isIntegerJump) {
                                    const lastSy = toScreenY(lastY_world);
                                    d += `L ${px.toFixed(2)},${lastSy.toFixed(2)} `;
                                    d += `M ${px.toFixed(2)},${sy.toFixed(2)} `;
                                } else {
                                    d += `L ${px.toFixed(2)},${sy.toFixed(2)} `;
                                }
                            }
                            lastY_world = y;
                        } else {
                            lastY_world = NaN;
                        }
                    }
                    return `<path d="${d}" stroke="${eq.color}" stroke-width="2" fill="none" />`;
                } catch (e) {
                    console.error("SVG Export error for eq:", eq.text, e);
                    return '';
                }
            }).join('\n');

            const axisColor = darkMode ? '#9ca3af' : '#6b7281';
            const axisX = `<line x1="0" y1="${toScreenY(0)}" x2="${width}" y2="${toScreenY(0)}" stroke="${axisColor}" stroke-width="1.5" />`;
            const axisY = `<line x1="${toScreenX(0)}" y1="0" x2="${toScreenX(0)}" y2="${height}" stroke="${axisColor}" stroke-width="1.5" />`;
            const bgColor = darkMode ? '#1f2937' : '#ffffff';

            const svgContent = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    <rect width="100%" height="100%" fill="${bgColor}" />
                    ${axisX}
                    ${axisY}
                    ${svgPaths}
                </svg>
            `;
            const fileName = "graph.svg";
            window.javaBridge.saveFile(svgContent, fileName);
        } else {
            alert("Export Error: The Java bridge is not connected.");
        }
    };

    const resetView = () => setView({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
    
    const renderResults = (results) => {
        if (!results || !results.length) return <p className="text-xs text-gray-500 italic">No points found in view.</p>
        return <div className="max-h-28 overflow-y-auto space-y-1">{results.map((p, i) => <p key={i} className="text-sm font-mono p-1 bg-gray-200 dark:bg-gray-600 rounded">({p.x.toFixed(3)}, {p.y.toFixed(3)})</p>)}</div>;
    };
    
    const isIntegralActive = analysis.mode === 'integral';
    const isIntersectionActive = analysis.mode === 'intersections';
    const isExtremaActive = analysis.mode === 'extrema';
    const isDerivativeActive = analysis.mode === 'derivative';

    return (
        <div className="w-full md:w-96 p-4 overflow-y-auto bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-sm h-full flex flex-col">
            <div className="flex-grow">
                 <div className="flex justify-between items-center mb-4">
                     <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Graphing Calculator</h2>
                     <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">{darkMode ? <Sun size={20} /> : <Moon size={20} />}</button>
                </div>
                
                <div className="mb-4">
                    <h3 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">Equations</h3>
                    <div className="space-y-2">{equations.map((eq) => (<div key={eq.id} className="flex items-center space-x-2 p-2 rounded-lg bg-white/70 dark:bg-gray-800/70 shadow-sm backdrop-blur-sm">
                        <input type="color" value={eq.color} onChange={(e) => updateEquation(eq.id, 'color', e.target.value)} className="w-8 h-8 rounded border-none cursor-pointer"/>
                        <div className="relative flex-grow"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">y =</span><input type="text" placeholder="e.g., x^2" value={eq.text} onChange={(e) => updateEquation(eq.id, 'text', e.target.value)} className="w-full pl-9 pr-2 py-1.5 rounded-md bg-gray-100 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"/></div>
                        <Tooltip text="Plot Derivative"><button onClick={() => addDerivative(eq)} disabled={!mathLoaded || !eq.text} className="p-1 rounded disabled:text-gray-400 disabled:cursor-not-allowed text-amber-500 hover:bg-amber-100"><Spline size={18} /></button></Tooltip>
                        <Tooltip text="Toggle Visibility"><button onClick={() => updateEquation(eq.id, 'visible', !eq.visible)} className={`p-1 rounded ${eq.visible ? 'text-blue-500' : 'text-gray-400'}`}><Target size={18} /></button></Tooltip>
                        <Tooltip text="Remove Equation"><button onClick={() => removeEquation(eq.id)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-100"><Minus size={18} /></button></Tooltip>
                    </div>))}</div>
                    <button onClick={addEquation} className="mt-2 w-full flex items-center justify-center space-x-2 py-2 px-4 border-2 border-dashed rounded-lg text-gray-500 hover:bg-gray-100/80 hover:border-blue-500 transition"><Plus size={16} /><span>Add Equation</span></button>
                </div>

                <div className="mb-4">
                    <h3 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">Analysis Tools</h3>
                    <div className="p-3 rounded-lg bg-white/70 dark:bg-gray-800/70 shadow-sm space-y-4 backdrop-blur-sm">
                        {/* Derivative at Point */}
                        <div className={`p-2 rounded-lg transition ${isDerivativeActive ? 'bg-amber-100 dark:bg-amber-900/50' : ''}`}>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center"><TrendingUp size={16} className="mr-2 text-amber-500"/>Derivative at Point</h4>
                            <select value={analysis.params.derivativeId || ''} onChange={e => setAnalysisParams({ ...analysis.params, derivativeId: Number(e.target.value)})} className="w-full p-2 rounded-md bg-gray-100 dark:bg-gray-700"><option disabled value="">Select an equation</option>{equations.map(eq => <option key={eq.id} value={eq.id}>y = {eq.text}</option>)}</select>
                            <div className="flex items-center space-x-2 mt-2">
                                <span className="text-sm">at x =</span>
                                <NumberInputWithSteppers value={analysis.params.derivativeX} onChange={v => setAnalysisParams({...analysis.params, derivativeX: v})} step={0.1} />
                            </div>
                            <button onClick={() => runAnalysis('derivative')} disabled={!analysis.params.derivativeId} className={`mt-2 w-full py-2 px-4 rounded-lg text-white font-semibold transition disabled:bg-gray-400 flex justify-center items-center space-x-2 ${isDerivativeActive ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}>{isDerivativeActive ? <XCircle size={18}/> : <TrendingUp size={18}/>}<span>{isDerivativeActive ? 'Clear' : 'Calculate'}</span></button>
                            {isDerivativeActive && analysis.results.derivative && (
                                <div className="mt-2 text-center font-mono p-2 bg-gray-200 dark:bg-gray-600 rounded">
                                    {isNaN(analysis.results.derivative.value) ? "Not differentiable" : `f'(${analysis.results.derivative.x.toFixed(2)}) ≈ ${analysis.results.derivative.value.toFixed(4)}`}
                                </div>
                            )}
                        </div>

                        {/* Definite Integral */}
                        <div className={`p-2 rounded-lg transition ${isIntegralActive ? 'bg-green-100 dark:bg-green-900/50' : ''}`}>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center"><Sigma size={16} className="mr-2 text-green-500"/>Definite Integral</h4>
                            <select value={analysis.params.integralId || ''} onChange={e => setAnalysisParams({ ...analysis.params, integralId: Number(e.target.value)})} className="w-full p-2 rounded-md bg-gray-100 dark:bg-gray-700"><option disabled value="">Select Eq for ∫f(x)dx</option>{equations.map(eq => <option key={eq.id} value={eq.id}>y = {eq.text}</option>)}</select>
                            <div className="flex items-center space-x-2 mt-2">
                                <span className="text-sm">From</span>
                                <NumberInputWithSteppers value={analysis.params.a} onChange={v => setAnalysisParams({...analysis.params, a: v})} step={0.1} />
                                <span className="text-sm">to</span>
                                <NumberInputWithSteppers value={analysis.params.b} onChange={v => setAnalysisParams({...analysis.params, b: v})} step={0.1} />
                            </div>
                            <button onClick={() => runAnalysis('integral')} disabled={!analysis.params.integralId} className={`mt-2 w-full py-2 px-4 rounded-lg text-white font-semibold transition disabled:bg-gray-400 flex justify-center items-center space-x-2 ${isIntegralActive ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}>{isIntegralActive ? <XCircle size={18}/> : <Sigma size={18}/>}<span>{isIntegralActive ? 'Clear' : 'Calculate'}</span></button>
                            {isIntegralActive && analysis.results.integral && <div className="mt-2 text-center font-mono p-2 bg-gray-200 dark:bg-gray-600 rounded">∫ ≈ {analysis.results.integral.toFixed(4)}</div>}
                        </div>

                        {/* Intersections */}
                        <div className={`p-2 rounded-lg transition ${isIntersectionActive ? 'bg-pink-100 dark:bg-pink-900/50' : ''}`}>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center"><GitCommit size={16} className="mr-2 text-pink-500"/>Intersections</h4>
                            <div className="space-y-2"><select value={analysis.params.eq1Id || ''} onChange={e => setAnalysisParams({...analysis.params, eq1Id: Number(e.target.value)})} className="w-full p-2 rounded-md bg-gray-100 dark:bg-gray-700"><option disabled value="">Select Eq 1</option>{equations.map(eq => <option key={eq.id} value={eq.id}>y = {eq.text}</option>)}</select><select value={analysis.params.eq2Id || ''} onChange={e => setAnalysisParams({...analysis.params, eq2Id: Number(e.target.value)})} className="w-full p-2 rounded-md bg-gray-100 dark:bg-gray-700"><option disabled value="">Select Eq 2</option>{equations.filter(eq => eq.id !== analysis.params.eq1Id).map(eq => <option key={eq.id} value={eq.id}>y = {eq.text}</option>)}</select></div>
                            <button onClick={() => runAnalysis('intersections')} disabled={!analysis.params.eq1Id || !analysis.params.eq2Id} className={`mt-2 w-full py-2 px-4 rounded-lg text-white font-semibold transition disabled:bg-gray-400 flex justify-center items-center space-x-2 ${isIntersectionActive ? 'bg-red-500 hover:bg-red-600' : 'bg-pink-500 hover:bg-pink-600'}`}>{isIntersectionActive ? <XCircle size={18}/> : <GitCommit size={18}/>}<span>{isIntersectionActive ? 'Clear' : 'Find'}</span></button>
                            {isIntersectionActive && <div className="mt-2">{renderResults(analysis.results.intersections)}</div>}
                        </div>

                        {/* Extrema */}
                        <div className={`p-2 rounded-lg transition ${isExtremaActive ? 'bg-indigo-100 dark:bg-indigo-900/50' : ''}`}>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center"><UnfoldVertical size={16} className="mr-2 text-indigo-500"/>Extrema</h4>
                            <select value={analysis.params.extremaId || ''} onChange={e => setAnalysisParams({...analysis.params, extremaId: Number(e.target.value)})} className="w-full p-2 rounded-md bg-gray-100 dark:bg-gray-700"><option disabled value="">Select an equation</option>{equations.map(eq => <option key={eq.id} value={eq.id}>y = {eq.text}</option>)}</select>
                            <button onClick={() => runAnalysis('extrema')} disabled={!analysis.params.extremaId} className={`mt-2 w-full py-2 px-4 rounded-lg text-white font-semibold transition disabled:bg-gray-400 flex justify-center items-center space-x-2 ${isExtremaActive ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}>{isExtremaActive ? <XCircle size={18}/> : <UnfoldVertical size={18}/>}<span>{isExtremaActive ? 'Clear' : 'Find'}</span></button>
                            {isExtremaActive && <>{analysis.results.extrema.min.length > 0 && <div className="mt-2"><h5 className="text-xs font-bold text-red-500 flex items-center"><ArrowDown size={14}/> Local Minima</h5>{renderResults(analysis.results.extrema.min)}</div>}{analysis.results.extrema.max.length > 0 && <div className="mt-2"><h5 className="text-xs font-bold text-green-500 flex items-center"><ArrowUp size={14}/> Local Maxima</h5>{renderResults(analysis.results.extrema.max)}</div>}{analysis.results.extrema.inflection.length > 0 && <div className="mt-2"><h5 className="text-xs font-bold text-amber-500">Inflection Points</h5>{renderResults(analysis.results.extrema.inflection)}</div>}</>}
                        </div>
                    </div>
                </div>

                 <div className="mb-4">
                    <h3 className="font-semibold mb-2 text-gray-700 dark:text-gray-300">View Controls</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <NumberInputWithSteppers label="X Min" value={view.xMin} onChange={v => setView({...view, xMin: v})} step={1} />
                        <NumberInputWithSteppers label="X Max" value={view.xMax} onChange={v => setView({...view, xMax: v})} step={1} />
                        <NumberInputWithSteppers label="Y Min" value={view.yMin} onChange={v => setView({...view, yMin: v})} step={1} />
                        <NumberInputWithSteppers label="Y Max" value={view.yMax} onChange={v => setView({...view, yMax: v})} step={1} />
                    </div>
                     <button onClick={resetView} className="mt-2 w-full flex items-center justify-center space-x-2 py-2 px-4 rounded-lg text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 transition">
                        <Move size={16} />
                        <span>Reset View</span>
                    </button>
                </div>

            </div>
            <div className="flex-shrink-0 pt-4 border-t border-gray-200/80 dark:border-gray-700/80">
                <div className="grid grid-cols-3 gap-2">
                    <Tooltip text="Save Workspace (.json)"><button onClick={handleSave} className="flex flex-col items-center p-2 rounded-lg bg-gray-200/50 hover:bg-gray-200"><Save size={20} /><span className="text-xs mt-1">Save</span></button></Tooltip>
                    <Tooltip text="Load Workspace (.json)"><button onClick={handleLoadClick} className="flex flex-col items-center p-2 rounded-lg bg-gray-200/50 hover:bg-gray-200"><FolderOpen size={20} /><span className="text-xs mt-1">Load</span></button></Tooltip>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden"/>
                    <Tooltip text="Export as SVG"><button onClick={handleExportSVG} className="flex flex-col items-center p-2 rounded-lg bg-gray-200/50 hover:bg-gray-200"><Download size={20}/><span className="text-xs mt-1">Export</span></button></Tooltip>
                </div>
            </div>
        </div>
    );
};

export default function App() {
    const [equations, setEquations] = useState([{ id: 1, text: 'sin(x)', color: '#3b82f6', visible: true },{ id: 2, text: 'x^2 / 10', color: '#ef4444', visible: true },]);
    const [view, setView] = useState({ xMin: -10, xMax: 10, yMin: -5, yMax: 5 });
    const [settings, setSettings] = useState({ showGrid: true });
    const [darkMode, setDarkMode] = useState(false);
    const [math, setMath] = useState(null);
    const [analysis, setAnalysis] = useState({
        mode: null,
        params: { eq1Id: null, eq2Id: null, extremaId: null, integralId: null, a: -2, b: 2, derivativeId: null, derivativeX: 0 },
        results: { intersections: [], extrema: { min: [], max: [], inflection: [] }, integral: null, derivative: null }
    });

    useEffect(() => {
        setMath(mathjs);
    }, []);

    const runAnalysis = (mode) => {
        if (!math) return;

        if (analysis.mode === mode) {
            setAnalysis(prev => ({
                ...prev,
                mode: null,
                results: {
                    ...prev.results,
                    ...(mode === 'intersections' && { intersections: [] }),
                    ...(mode === 'extrema' && { extrema: { min: [], max: [], inflection: [] } }),
                    ...(mode === 'integral' && { integral: null }),
                    ...(mode === 'derivative' && { derivative: null }),
                }
            }));
            return;
        }

        const { params } = analysis;
        let newResults = { ...analysis.results };

        try {
            if (mode === 'integral') {
                const eq = equations.find(e => e.id === params.integralId);
                const result = calculateIntegral(x => math.evaluate(eq.text, {x}), params.a, params.b);
                newResults.integral = !isNaN(result) ? result : null;
            }
            if (mode === 'intersections') {
                const eq1 = equations.find(e => e.id === params.eq1Id);
                const eq2 = equations.find(e => e.id === params.eq2Id);
                const diffFunc = x => math.evaluate(`(${eq1.text}) - (${eq2.text})`, {x});
                const intersectionX = scanForRoots(diffFunc, view.xMin, view.xMax);
                newResults.intersections = intersectionX.map(x => ({ x, y: math.evaluate(eq1.text, { x }) }));
            }
            if (mode === 'extrema') {
                const eq = equations.find(e => e.id === params.extremaId);
                const fPrime = math.derivative(eq.text, 'x');
                const fDoublePrime = math.derivative(fPrime, 'x');
                
                const criticalPointsX = scanForRoots(x => fPrime.evaluate({x}), view.xMin, view.xMax);
                const inflectionPointsX = scanForRoots(x => fDoublePrime.evaluate({x}), view.xMin, view.xMax);
                
                newResults.extrema = { min: [], max: [], inflection: [] };
                criticalPointsX.forEach(x => {
                    const d2y = fDoublePrime.evaluate({x});
                    if (d2y > 0) newResults.extrema.min.push({x, y: math.evaluate(eq.text, {x})});
                    else if (d2y < 0) newResults.extrema.max.push({x, y: math.evaluate(eq.text, {x})});
                });
                newResults.extrema.inflection = inflectionPointsX.map(x => ({x, y: math.evaluate(eq.text, {x})}));
            }
            if (mode === 'derivative') {
                const eq = equations.find(e => e.id === params.derivativeId);
                const x0 = params.derivativeX;
                const y0 = math.evaluate(eq.text, {x: x0});

                if (!isFinite(y0)) {
                     newResults.derivative = { value: NaN, x: x0, y: y0, tangent: null };
                } else {
                    const compiledFunc = x => math.evaluate(eq.text, {x});
                    const derivResult = calculateDerivative(compiledFunc, x0);

                    newResults.derivative = {
                        value: derivResult.value,
                        x: x0,
                        y: y0,
                        tangent: !isNaN(derivResult.value) ? { slope: derivResult.value, x0, y0 } : null
                    };
                }
            }
        } catch (e) {
            console.error(`Analysis Error (${mode}):`, e);
            alert(`Could not perform analysis. The function may be too complex, discontinuous, or not differentiable.`);
        }
        setAnalysis({ ...analysis, mode, results: newResults });
    };

    const backgroundStyle = {
        backgroundColor: darkMode ? '#030712' : '#f9fafb', // gray-950 or gray-50
        backgroundImage: `
            linear-gradient(${darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)'} 1px, transparent 1px),
            linear-gradient(to right, ${darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)'} 1px, transparent 1px)
        `,
        backgroundSize: '20px 20px',
    };

    return (
        <div style={backgroundStyle} className={'font-sans w-full h-screen flex flex-col md:flex-row transition-colors duration-300'}>
            <div className="flex-grow p-4">
                 <GraphCanvas math={math} equations={equations} view={view} setView={setView} settings={settings} darkMode={darkMode} analysis={analysis} />
            </div>
            <div className="w-full md:w-96 flex-shrink-0 h-1/2 md:h-full shadow-2xl z-10">
                <ControlsPanel {...{ equations, setEquations, view, setView, settings, setSettings, darkMode, setDarkMode, runAnalysis, math, mathLoaded: !!math, analysis, setAnalysisParams: p => setAnalysis({...analysis, params: p}) }} />
            </div>
        </div>
    );
}
