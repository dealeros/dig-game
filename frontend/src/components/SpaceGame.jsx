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

    // Mouse click handler for tunnel digging
    const handleMouseDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      digTunnel(clickX, clickY);
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    startGameLoop();

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      stopGameLoop();
    };
  }, []);

  const digTunnel = useCallback((x, y) => {
    const gameState = gameStateRef.current;
    const hero = heroRef.current;
    
    // Check if click is outside the sphere (in rock area)
    const distanceFromCenter = Math.sqrt((x - gameState.centerX) ** 2 + (y - gameState.centerY) ** 2);
    
    if (distanceFromCenter > gameState.sphereRadius) {
      // Check if hero is close enough to dig (within 30 pixels of sphere edge)
      const heroDistFromCenter = Math.sqrt((hero.x - gameState.centerX) ** 2 + (hero.y - gameState.centerY) ** 2);
      const heroDistFromEdge = Math.abs(heroDistFromCenter - gameState.sphereRadius);
      
      if (heroDistFromEdge < 30) {
        // Create a new tunnel
        const tunnel = {
          id: Date.now(),
          x,
          y,
          radius: gameState.digRadius,
          timestamp: Date.now()
        };
        
        gameState.tunnels.push(tunnel);
        gameState.isDigging = true;
        
        // Brief digging animation
        setTimeout(() => {
          gameState.isDigging = false;
        }, 200);
      }
    }
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

    // Improved movement - less springy, more controlled
    if (distance > 3) { // Smaller dead zone
      const dirX = dx / distance;
      const dirY = dy / distance;
      
      // Reduce acceleration when close to target
      const accel = distance > 50 ? hero.acceleration : hero.acceleration * (distance / 50);
      
      hero.vx += dirX * accel;
      hero.vy += dirY * accel;
    } else {
      // Strong deceleration when very close to mouse
      hero.vx *= 0.8;
      hero.vy *= 0.8;
    }

    // Apply friction
    hero.vx *= hero.friction;
    hero.vy *= hero.friction;

    // Stop very small movements to reduce jitter
    if (Math.abs(hero.vx) < hero.stopThreshold) hero.vx = 0;
    if (Math.abs(hero.vy) < hero.stopThreshold) hero.vy = 0;

    // Limit maximum speed
    const currentSpeed = Math.sqrt(hero.vx * hero.vx + hero.vy * hero.vy);
    if (currentSpeed > hero.maxSpeed) {
      hero.vx = (hero.vx / currentSpeed) * hero.maxSpeed;
      hero.vy = (hero.vy / currentSpeed) * hero.maxSpeed;
    }

    // Update position
    hero.x += hero.vx;
    hero.y += hero.vy;

    // Collision detection with sphere boundaries and tunnels
    const distanceFromCenter = Math.sqrt(
      (hero.x - gameState.centerX) ** 2 + (hero.y - gameState.centerY) ** 2
    );

    // Check if hero can move through tunnels (account for hero radius)
    let canMoveInRock = false;
    for (const tunnel of gameState.tunnels) {
      const distToTunnel = Math.sqrt((hero.x - tunnel.x) ** 2 + (hero.y - tunnel.y) ** 2);
      // Hero can move if its center is within tunnel radius minus hero radius
      if (distToTunnel + hero.radius < tunnel.radius) {
        canMoveInRock = true;
        break;
      }
    }

    // Only apply sphere collision if hero is outside sphere AND not in a valid tunnel
    if (distanceFromCenter + hero.radius > gameState.sphereRadius && !canMoveInRock) {
      // Calculate collision normal
      const normalX = (hero.x - gameState.centerX) / distanceFromCenter;
      const normalY = (hero.y - gameState.centerY) / distanceFromCenter;

      // Position hero at boundary
      hero.x = gameState.centerX + normalX * (gameState.sphereRadius - hero.radius);
      hero.y = gameState.centerY + normalY * (gameState.sphereRadius - hero.radius);

      // Softer bounce effect
      const dotProduct = hero.vx * normalX + hero.vy * normalY;
      hero.vx -= 2 * dotProduct * normalX * 0.5; // Reduced bounce
      hero.vy -= 2 * dotProduct * normalY * 0.5;
    }

    // Update stats for display
    setGameStats({
      position: { x: Math.round(hero.x), y: Math.round(hero.y) },
      velocity: { x: Math.round(hero.vx * 10) / 10, y: Math.round(hero.vy * 10) / 10 },
      tunnelsCount: gameState.tunnels.length,
      isDigging: gameState.isDigging
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

    // Draw tunnels in the rock
    ctx.fillStyle = '#1a1a1a'; // Same as living space
    for (const tunnel of gameState.tunnels) {
      ctx.beginPath();
      ctx.arc(tunnel.x, tunnel.y, tunnel.radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw tunnel outline
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Add tunnel grid pattern
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.5;
      const gridSize = 5;
      for (let x = tunnel.x - tunnel.radius; x <= tunnel.x + tunnel.radius; x += gridSize) {
        for (let y = tunnel.y - tunnel.radius; y <= tunnel.y + tunnel.radius; y += gridSize) {
          const distFromTunnelCenter = Math.sqrt((x - tunnel.x) ** 2 + (y - tunnel.y) ** 2);
          if (distFromTunnelCenter < tunnel.radius) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 1, y);
            ctx.stroke();
          }
        }
      }
    }

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
    const heroColor = gameState.isDigging ? '#ffff00' : '#00ff88'; // Yellow when digging
    ctx.fillStyle = heroColor;
    ctx.fillRect(hero.x - hero.radius, hero.y - hero.radius, hero.radius * 2, hero.radius * 2);
    
    // Add thruster effect based on velocity
    const speed = Math.sqrt(hero.vx * hero.vx + hero.vy * hero.vy);
    if (speed > 0.5) {
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(hero.x - hero.radius/2, hero.y + hero.radius, hero.radius, hero.radius/2);
    }

    // Draw digging indicator when near sphere edge
    const heroDistFromCenter = Math.sqrt((hero.x - gameState.centerX) ** 2 + (hero.y - gameState.centerY) ** 2);
    const heroDistFromEdge = Math.abs(heroDistFromCenter - gameState.sphereRadius);
    
    if (heroDistFromEdge < 30) {
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(hero.x, hero.y, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
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

    // Show digging cursor when over rock
    const mouseDistFromCenter = Math.sqrt(
      (mouseRef.current.x - gameState.centerX) ** 2 + 
      (mouseRef.current.y - gameState.centerY) ** 2
    );
    
    if (mouseDistFromCenter > gameState.sphereRadius && heroDistFromEdge < 30) {
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mouseRef.current.x, mouseRef.current.y, gameState.digRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

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
          <div>TUNNELS: {gameStats.tunnelsCount}</div>
          {gameStats.isDigging && <div className="text-yellow-400">DIGGING...</div>}
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
          <p>• Click on rock (outside sphere) to dig tunnels</p>
          <p>• Get close to sphere edge to enable digging</p>
          <p>• Travel through your tunnels to explore</p>
          <p>• Discover what lies beyond the rock...</p>
        </div>
      </Card>
    </div>
  );
};

export default SpaceGame;