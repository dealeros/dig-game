import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card } from './ui/card';

const SpaceGame = () => {
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const heroRef = useRef({
    x: 400, // Center of canvas
    y: 300,
    vx: 0, // Velocity X
    vy: 0, // Velocity Y
    radius: 4,
    maxSpeed: 4,
    acceleration: 0.15,
    friction: 0.92,
    stopThreshold: 0.1
  });

  const gameStateRef = useRef({
    sphereRadius: 200,
    centerX: 400,
    centerY: 300,
    isRunning: false,
    tunnels: [], // Array to store dug tunnels
    isDigging: false,
    digRadius: 15
  });

  const [gameStats, setGameStats] = useState({
    position: { x: 400, y: 300 },
    velocity: { x: 0, y: 0 },
    tunnelsCount: 0,
    isDigging: false
  });

  // Initialize canvas and start game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; // Pixel art style

    // Mouse move handler
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    startGameLoop();

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      stopGameLoop();
    };
  }, []);

  const startGameLoop = useCallback(() => {
    gameStateRef.current.isRunning = true;
    
    const gameLoop = () => {
      if (!gameStateRef.current.isRunning) return;
      
      updateHero();
      render();
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };
    
    gameLoop();
  }, []);

  const stopGameLoop = useCallback(() => {
    gameStateRef.current.isRunning = false;
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
  }, []);

  const updateHero = useCallback(() => {
    const hero = heroRef.current;
    const mouse = mouseRef.current;
    const gameState = gameStateRef.current;

    // Calculate distance and direction to mouse
    const dx = mouse.x - hero.x;
    const dy = mouse.y - hero.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Apply movement towards mouse (zero gravity physics)
    if (distance > 5) { // Dead zone around mouse
      const dirX = dx / distance;
      const dirY = dy / distance;
      
      hero.vx += dirX * hero.acceleration;
      hero.vy += dirY * hero.acceleration;
    }

    // Apply friction
    hero.vx *= hero.friction;
    hero.vy *= hero.friction;

    // Limit maximum speed
    const currentSpeed = Math.sqrt(hero.vx * hero.vx + hero.vy * hero.vy);
    if (currentSpeed > hero.maxSpeed) {
      hero.vx = (hero.vx / currentSpeed) * hero.maxSpeed;
      hero.vy = (hero.vy / currentSpeed) * hero.maxSpeed;
    }

    // Update position
    hero.x += hero.vx;
    hero.y += hero.vy;

    // Collision detection with sphere boundaries
    const distanceFromCenter = Math.sqrt(
      (hero.x - gameState.centerX) ** 2 + (hero.y - gameState.centerY) ** 2
    );

    if (distanceFromCenter + hero.radius > gameState.sphereRadius) {
      // Calculate collision normal
      const normalX = (hero.x - gameState.centerX) / distanceFromCenter;
      const normalY = (hero.y - gameState.centerY) / distanceFromCenter;

      // Position hero at boundary
      hero.x = gameState.centerX + normalX * (gameState.sphereRadius - hero.radius);
      hero.y = gameState.centerY + normalY * (gameState.sphereRadius - hero.radius);

      // Reflect velocity (bounce effect)
      const dotProduct = hero.vx * normalX + hero.vy * normalY;
      hero.vx -= 2 * dotProduct * normalX * 0.8; // 0.8 for energy loss
      hero.vy -= 2 * dotProduct * normalY * 0.8;
    }

    // Update stats for display
    setGameStats({
      position: { x: Math.round(hero.x), y: Math.round(hero.y) },
      velocity: { x: Math.round(hero.vx * 10) / 10, y: Math.round(hero.vy * 10) / 10 }
    });
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const hero = heroRef.current;
    const gameState = gameStateRef.current;

    // Clear canvas with dark space background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw rock surroundings (everything outside the sphere)
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw the living sphere (hollow center)
    ctx.fillStyle = '#1a1a1a'; // Darker for the living space
    ctx.beginPath();
    ctx.arc(gameState.centerX, gameState.centerY, gameState.sphereRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw sphere boundary (retro pixel style)
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]); // Dashed line for retro feel
    ctx.beginPath();
    ctx.arc(gameState.centerX, gameState.centerY, gameState.sphereRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // Draw grid pattern in living space for retro feel
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    const gridSize = 20;
    
    for (let x = gameState.centerX - gameState.sphereRadius; x <= gameState.centerX + gameState.sphereRadius; x += gridSize) {
      for (let y = gameState.centerY - gameState.sphereRadius; y <= gameState.centerY + gameState.sphereRadius; y += gridSize) {
        const distFromCenter = Math.sqrt((x - gameState.centerX) ** 2 + (y - gameState.centerY) ** 2);
        if (distFromCenter < gameState.sphereRadius) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 1, y);
          ctx.stroke();
        }
      }
    }

    // Draw hero (retro pixel ship)
    ctx.fillStyle = '#00ff88'; // Bright green for hero
    ctx.fillRect(hero.x - hero.radius, hero.y - hero.radius, hero.radius * 2, hero.radius * 2);
    
    // Add thruster effect based on velocity
    const speed = Math.sqrt(hero.vx * hero.vx + hero.vy * hero.vy);
    if (speed > 0.5) {
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(hero.x - hero.radius/2, hero.y + hero.radius, hero.radius, hero.radius/2);
    }

    // Draw mouse cursor as target
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mouseRef.current.x, mouseRef.current.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    
    // Crosshair
    ctx.beginPath();
    ctx.moveTo(mouseRef.current.x - 12, mouseRef.current.y);
    ctx.lineTo(mouseRef.current.x + 12, mouseRef.current.y);
    ctx.moveTo(mouseRef.current.x, mouseRef.current.y - 12);
    ctx.lineTo(mouseRef.current.x, mouseRef.current.y + 12);
    ctx.stroke();

  }, []);

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-gray-900 min-h-screen">
      <Card className="p-6 bg-gray-800 border-gray-700">
        <h1 className="text-2xl font-bold text-green-400 mb-2 text-center font-mono">
          CORE SPHERE EXPLORER
        </h1>
        <p className="text-gray-300 text-center mb-4 font-mono text-sm">
          Navigate the hollow core with your mouse. Discover what lies beyond the rock.
        </p>
        
        <div className="flex gap-4 justify-center text-xs font-mono text-gray-400 mb-4">
          <div>POS: {gameStats.position.x}, {gameStats.position.y}</div>
          <div>VEL: {gameStats.velocity.x}, {gameStats.velocity.y}</div>
        </div>
      </Card>

      <Card className="p-2 bg-gray-800 border-gray-700">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className="border border-gray-600 cursor-none bg-black"
          style={{ imageRendering: 'pixelated' }}
        />
      </Card>

      <Card className="p-4 bg-gray-800 border-gray-700 max-w-md">
        <h3 className="text-green-400 font-mono font-bold mb-2">MISSION LOG</h3>
        <div className="text-gray-300 text-sm font-mono space-y-1">
          <p>• Move mouse to navigate your vessel</p>
          <p>• Zero gravity physics active</p>
          <p>• Stay within the core sphere</p>
          <p>• Prepare for rock expeditions...</p>
        </div>
      </Card>
    </div>
  );
};

export default SpaceGame;