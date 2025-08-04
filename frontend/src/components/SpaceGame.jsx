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
    rockPiles: [], // Array to store displaced rock piles
    isDigging: false,
    digRadius: 15
  });

  const [gameStats, setGameStats] = useState({
    position: { x: 400, y: 300 },
    velocity: { x: 0, y: 0 },
    tunnelsCount: 0,
    isDigging: false
  });

  const findEmptySpaceForRock = useCallback((gameState, excludeX, excludeY, excludeRadius) => {
    const maxAttempts = 30;
    // Place rock piles in the empty core space where they can float
    const coreRadius = gameState.sphereRadius - 20; // Inside the core sphere
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Generate random position within the core sphere (empty space)
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * coreRadius;
      
      const x = gameState.centerX + Math.cos(angle) * distance;
      const y = gameState.centerY + Math.sin(angle) * distance;
      
      // Make sure it's actually in empty space (within core sphere)
      const distFromCenter = Math.sqrt((x - gameState.centerX) ** 2 + (y - gameState.centerY) ** 2);
      if (distFromCenter > coreRadius) continue;
      
      // Check if this position is clear of existing rock piles and hero
      let isValidPosition = true;
      
      // Check existing rock piles
      for (const pile of gameState.rockPiles) {
        const dist = Math.sqrt((x - pile.x) ** 2 + (y - pile.y) ** 2);
        if (dist < pile.radius + 20) {
          isValidPosition = false;
          break;
        }
      }
      
      if (!isValidPosition) continue;
      
      // Check distance from hero
      const heroRef = gameState.hero || { x: gameState.centerX, y: gameState.centerY };
      const distFromHero = Math.sqrt((x - heroRef.x) ** 2 + (y - heroRef.y) ** 2);
      if (distFromHero < 30) {
        isValidPosition = false;
        continue;
      }
      
      if (isValidPosition) {
        return { x, y };
      }
    }
    
    // Fallback: place it at a safe location in the core
    return {
      x: gameState.centerX + (Math.random() - 0.5) * 100,
      y: gameState.centerY + (Math.random() - 0.5) * 100
    };
  }, []);

  const digTunnel = useCallback((x, y) => {
    const gameState = gameStateRef.current;
    const hero = heroRef.current;
    
    // Check if click is in a diggable area (rock)
    const distanceFromCenter = Math.sqrt((x - gameState.centerX) ** 2 + (y - gameState.centerY) ** 2);
    
    let canDig = false;
    let connectionPoint = null;
    
    // Must be in rock (outside sphere and not in existing tunnel)
    let inRock = distanceFromCenter > gameState.sphereRadius;
    
    if (inRock) {
      // Check if not in existing tunnel
      for (const tunnel of gameState.tunnels) {
        const distToTunnel = Math.sqrt((x - tunnel.x) ** 2 + (y - tunnel.y) ** 2);
        if (distToTunnel < tunnel.radius) {
          inRock = false;
          break;
        }
      }
    }
    
    if (inRock) {
      // Check if hero is in a position to dig (in sphere or tunnel)
      const heroDistFromCenter = Math.sqrt((hero.x - gameState.centerX) ** 2 + (hero.y - gameState.centerY) ** 2);
      let heroInValidPosition = heroDistFromCenter <= gameState.sphereRadius;
      
      if (!heroInValidPosition) {
        // Check if hero is in any tunnel
        for (const tunnel of gameState.tunnels) {
          const heroDistToTunnel = Math.sqrt((hero.x - tunnel.x) ** 2 + (hero.y - tunnel.y) ** 2);
          if (heroDistToTunnel <= tunnel.radius) {
            heroInValidPosition = true;
            connectionPoint = { x: tunnel.x, y: tunnel.y, radius: tunnel.radius };
            break;
          }
        }
      } else {
        // Hero is in sphere, connection point is closest point on sphere edge toward click
        const dirX = (x - gameState.centerX) / distanceFromCenter;
        const dirY = (y - gameState.centerY) / distanceFromCenter;
        connectionPoint = {
          x: gameState.centerX + dirX * gameState.sphereRadius,
          y: gameState.centerY + dirY * gameState.sphereRadius,
          radius: 0
        };
      }
      
      if (heroInValidPosition && connectionPoint) {
        // Check if click is within reasonable digging distance
        const distanceToClick = Math.sqrt((connectionPoint.x - x) ** 2 + (connectionPoint.y - y) ** 2);
        if (distanceToClick <= 100) { // Maximum digging distance
          canDig = true;
        }
      }
    }
    
    if (canDig && connectionPoint) {
      // Create a tunnel segment that connects to the existing space
      const startX = connectionPoint.x;
      const startY = connectionPoint.y;
      const endX = x;
      const endY = y;
      
      // Create connecting tunnel segments
      const distance = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
      const segments = Math.max(1, Math.floor(distance / (gameState.digRadius * 1.5)));
      
      let totalRockVolume = 0;
      
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const segmentX = startX + (endX - startX) * t;
        const segmentY = startY + (endY - startY) * t;
        
        // Check if this position already has a tunnel
        let alreadyExists = false;
        for (const tunnel of gameState.tunnels) {
          const dist = Math.sqrt((segmentX - tunnel.x) ** 2 + (segmentY - tunnel.y) ** 2);
          if (dist < gameState.digRadius) {
            alreadyExists = true;
            break;
          }
        }
        
        if (!alreadyExists) {
          // Check if in rock (not in core sphere)
          const segmentDistFromCenter = Math.sqrt((segmentX - gameState.centerX) ** 2 + (segmentY - gameState.centerY) ** 2);
          if (segmentDistFromCenter > gameState.sphereRadius) {
            const tunnel = {
              id: Date.now() + i,
              x: segmentX,
              y: segmentY,
              radius: gameState.digRadius,
              timestamp: Date.now(),
              segment: i,
              totalSegments: segments
            };
            
            gameState.tunnels.push(tunnel);
            totalRockVolume += Math.PI * gameState.digRadius * gameState.digRadius;
          }
        }
      }
      
      // Create rock pile from all displaced rock
      if (totalRockVolume > 0) {
        const rockPileRadius = Math.sqrt(totalRockVolume / Math.PI) * 0.6;
        const rockPosition = findEmptySpaceForRock(gameState, x, y, rockPileRadius);
        
        const rockPile = {
          id: Date.now() + 1000,
          x: rockPosition.x,
          y: rockPosition.y,
          radius: rockPileRadius,
          timestamp: Date.now(),
          fromTunnelSegments: segments + 1
        };
        
        gameState.rockPiles.push(rockPile);
      }
      
      gameState.isDigging = true;
      
      setTimeout(() => {
        gameState.isDigging = false;
      }, 300);
    }
  }, [findEmptySpaceForRock]);

  // Initialize canvas and start game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; // Pixel art style

    // Mouse move handler
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      // Scale coordinates to canvas size
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      mouseRef.current = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    // Mouse click handler for tunnel digging
    const handleMouseDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      // Scale coordinates to canvas size
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;
      
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
  }, [digTunnel]);

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

    // Store previous position for collision recovery
    const prevX = hero.x - hero.vx;
    const prevY = hero.y - hero.vy;

    // Check if current position is in valid space (core sphere or any tunnel)
    const distanceFromCenter = Math.sqrt(
      (hero.x - gameState.centerX) ** 2 + (hero.y - gameState.centerY) ** 2
    );

    let inValidSpace = false;
    
    // Check if in core sphere
    if (distanceFromCenter <= gameState.sphereRadius - hero.radius) {
      inValidSpace = true;
    }
    
    // Check if in any tunnel
    if (!inValidSpace) {
      for (const tunnel of gameState.tunnels) {
        const distToTunnel = Math.sqrt((hero.x - tunnel.x) ** 2 + (hero.y - tunnel.y) ** 2);
        if (distToTunnel <= tunnel.radius - hero.radius) {
          inValidSpace = true;
          break;
        }
      }
    }

    // If not in valid space, find closest valid position
    if (!inValidSpace) {
      let closestValidPoint = null;
      let closestDistance = Infinity;

      // Check distance to core sphere edge
      const distToCoreEdge = Math.abs(distanceFromCenter - (gameState.sphereRadius - hero.radius));
      if (distToCoreEdge < closestDistance) {
        closestDistance = distToCoreEdge;
        const normalX = (hero.x - gameState.centerX) / distanceFromCenter;
        const normalY = (hero.y - gameState.centerY) / distanceFromCenter;
        closestValidPoint = {
          x: gameState.centerX + normalX * (gameState.sphereRadius - hero.radius),
          y: gameState.centerY + normalY * (gameState.sphereRadius - hero.radius),
          type: 'sphere'
        };
      }

      // Check distance to each tunnel
      for (const tunnel of gameState.tunnels) {
        const distToTunnelCenter = Math.sqrt((hero.x - tunnel.x) ** 2 + (hero.y - tunnel.y) ** 2);
        const distToTunnelEdge = Math.abs(distToTunnelCenter - (tunnel.radius - hero.radius));
        
        if (distToTunnelEdge < closestDistance) {
          closestDistance = distToTunnelEdge;
          const normalX = (hero.x - tunnel.x) / distToTunnelCenter;
          const normalY = (hero.y - tunnel.y) / distToTunnelCenter;
          closestValidPoint = {
            x: tunnel.x + normalX * (tunnel.radius - hero.radius),
            y: tunnel.y + normalY * (tunnel.radius - hero.radius),
            type: 'tunnel'
          };
        }
      }

      // Move hero to closest valid position
      if (closestValidPoint) {
        hero.x = closestValidPoint.x;
        hero.y = closestValidPoint.y;
        
        // Reduce velocity when hitting walls
        hero.vx *= 0.3;
        hero.vy *= 0.3;
      }
    }

    // Check collision with rock piles (they float in core space, hero bounces off them)
    for (const pile of gameState.rockPiles) {
      const distToPile = Math.sqrt((hero.x - pile.x) ** 2 + (hero.y - pile.y) ** 2);
      if (distToPile < pile.radius + hero.radius) {
        // Calculate collision normal
        const normalX = (hero.x - pile.x) / distToPile;
        const normalY = (hero.y - pile.y) / distToPile;

        // Push hero away from rock pile
        hero.x = pile.x + normalX * (pile.radius + hero.radius + 1);
        hero.y = pile.y + normalY * (pile.radius + hero.radius + 1);

        // Bounce off rock pile
        const dotProduct = hero.vx * normalX + hero.vy * normalY;
        hero.vx -= 2 * dotProduct * normalX * 0.6;
        hero.vy -= 2 * dotProduct * normalY * 0.6;
      }
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

    // Draw the living sphere (hollow center) - no border
    ctx.fillStyle = '#1a1a1a'; // Darker for the living space
    ctx.beginPath();
    ctx.arc(gameState.centerX, gameState.centerY, gameState.sphereRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw tunnels in the rock - no borders
    ctx.fillStyle = '#1a1a1a'; // Same as living space
    for (const tunnel of gameState.tunnels) {
      ctx.beginPath();
      ctx.arc(tunnel.x, tunnel.y, tunnel.radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Add tunnel grid pattern for texture
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

    // Draw displaced rock piles (floating in core space)
    for (const pile of gameState.rockPiles) {
      // Draw floating rock pile with glow effect to show it's floating
      ctx.fillStyle = '#4a4a4a'; // Lighter than surrounding rock
      ctx.beginPath();
      ctx.arc(pile.x, pile.y, pile.radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Add floating glow effect
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(pile.x, pile.y, pile.radius + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Add rock pile texture with chunks
      ctx.fillStyle = '#5a5a5a';
      const chunks = 6;
      for (let i = 0; i < chunks; i++) {
        const angle = (i / chunks) * Math.PI * 2;
        const distance = Math.random() * pile.radius * 0.5;
        const chunkX = pile.x + Math.cos(angle) * distance;
        const chunkY = pile.y + Math.sin(angle) * distance;
        const chunkSize = 1 + Math.random() * 2;
        
        ctx.beginPath();
        ctx.arc(chunkX, chunkY, chunkSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }

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

    // Draw digging indicator when hero is in valid digging position
    const heroDistFromCenter = Math.sqrt((hero.x - gameState.centerX) ** 2 + (hero.y - gameState.centerY) ** 2);
    let heroCanDig = heroDistFromCenter <= gameState.sphereRadius;
    
    // Also check if hero is in any tunnel
    if (!heroCanDig) {
      for (const tunnel of gameState.tunnels) {
        const distToTunnel = Math.sqrt((hero.x - tunnel.x) ** 2 + (hero.y - tunnel.y) ** 2);
        if (distToTunnel <= tunnel.radius) {
          heroCanDig = true;
          break;
        }
      }
    }
    
    if (heroCanDig) {
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

    // Show digging preview when conditions are met
    const mouseDistFromCenter = Math.sqrt(
      (mouseRef.current.x - gameState.centerX) ** 2 + 
      (mouseRef.current.y - gameState.centerY) ** 2
    );
    
    // Check if mouse is in rock and hero can dig
    let mouseInRock = mouseDistFromCenter > gameState.sphereRadius;
    if (mouseInRock) {
      // Make sure mouse is not in existing tunnel
      for (const tunnel of gameState.tunnels) {
        const distToTunnel = Math.sqrt((mouseRef.current.x - tunnel.x) ** 2 + (mouseRef.current.y - tunnel.y) ** 2);
        if (distToTunnel < tunnel.radius) {
          mouseInRock = false;
          break;
        }
      }
    }
    
    if (mouseInRock && heroCanDig) {
      // Find connection point
      let connectionPoint = null;
      if (heroDistFromCenter <= gameState.sphereRadius) {
        // Connect from sphere
        const dirX = (mouseRef.current.x - gameState.centerX) / mouseDistFromCenter;
        const dirY = (mouseRef.current.y - gameState.centerY) / mouseDistFromCenter;
        connectionPoint = {
          x: gameState.centerX + dirX * gameState.sphereRadius,
          y: gameState.centerY + dirY * gameState.sphereRadius
        };
      } else {
        // Connect from tunnel
        for (const tunnel of gameState.tunnels) {
          const distToTunnel = Math.sqrt((hero.x - tunnel.x) ** 2 + (hero.y - tunnel.y) ** 2);
          if (distToTunnel <= tunnel.radius) {
            connectionPoint = { x: tunnel.x, y: tunnel.y };
            break;
          }
        }
      }
      
      if (connectionPoint) {
        const distanceToClick = Math.sqrt((connectionPoint.x - mouseRef.current.x) ** 2 + (connectionPoint.y - mouseRef.current.y) ** 2);
        if (distanceToClick <= 100) {
          // Draw connection line preview
          ctx.strokeStyle = '#ffaa00';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(connectionPoint.x, connectionPoint.y);
          ctx.lineTo(mouseRef.current.x, mouseRef.current.y);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Draw target circle
          ctx.strokeStyle = '#ffaa00';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(mouseRef.current.x, mouseRef.current.y, gameState.digRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
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