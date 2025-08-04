import React, { useRef, useEffect, useState, useCallback } from "react";
import { Card } from "./ui/card";

const SpaceGame = () => {
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const cameraRef = useRef({ x: 0, y: 0 });
  const heroRef = useRef({
    x: 400, // Center of canvas
    y: 300,
    vx: 0, // Velocity X
    vy: 0, // Velocity Y
    radius: 4,
    maxSpeed: 4,
    acceleration: 0.15,
    friction: 0.92,
    stopThreshold: 0.1,
  });

  const gameStateRef = useRef({
    sphereRadius: 200,
    centerX: 400,
    centerY: 300,
    isRunning: false,
    tunnels: [], // Array to store dug tunnels
    rockPiles: [], // Array to store displaced rock piles
    isDigging: false,
    digRadius: 15,
    rockChunks: new Map(), // Map to store generated rock chunks by grid coordinates
    chunkSize: 400, // Size of each procedural chunk
    renderDistance: 2, // How many chunks around camera to render
    noiseScale: 0.01, // Scale for procedural noise
  });

  const [gameStats, setGameStats] = useState({
    position: { x: 400, y: 300 },
    velocity: { x: 0, y: 0 },
    tunnelsCount: 0,
    isDigging: false,
    chunksGenerated: 0,
  });

  // Simple noise function for procedural generation
  const noise = useCallback((x, y) => {
    // Simple pseudo-random noise based on coordinates
    const seed = x * 12.9898 + y * 78.233;
    return Math.abs(Math.sin(seed * 43758.5453) % 1);
  }, []);

  // Generate rock density at a given position
  const getRockDensity = useCallback(
    (worldX, worldY) => {
      const gameState = gameStateRef.current;

      // Distance from original sphere center
      const distFromOrigin = Math.sqrt(
        (worldX - gameState.centerX) ** 2 + (worldY - gameState.centerY) ** 2,
      );

      // Core sphere is always empty
      if (distFromOrigin <= gameState.sphereRadius) {
        return 0;
      }

      // Generate procedural rock density
      const n1 = noise(
        worldX * gameState.noiseScale,
        worldY * gameState.noiseScale,
      );
      const n2 =
        noise(
          worldX * gameState.noiseScale * 2,
          worldY * gameState.noiseScale * 2,
        ) * 0.5;
      const n3 =
        noise(
          worldX * gameState.noiseScale * 4,
          worldY * gameState.noiseScale * 4,
        ) * 0.25;

      const density = n1 + n2 + n3;

      // Create some variation - not all areas are solid rock
      return density > 0.6 ? 1 : 0;
    },
    [noise],
  );

  // Generate rock chunk for a grid position
  const generateRockChunk = useCallback(
    (chunkX, chunkY) => {
      const gameState = gameStateRef.current;
      const chunk = {
        x: chunkX,
        y: chunkY,
        rockPixels: [],
      };

      const startX = chunkX * gameState.chunkSize;
      const startY = chunkY * gameState.chunkSize;
      const pixelSize = 8; // Size of each rock "pixel"

      // Generate rock pixels in this chunk
      for (let x = startX; x < startX + gameState.chunkSize; x += pixelSize) {
        for (let y = startY; y < startY + gameState.chunkSize; y += pixelSize) {
          if (getRockDensity(x, y) > 0) {
            chunk.rockPixels.push({ x, y, size: pixelSize });
          }
        }
      }

      return chunk;
    },
    [getRockDensity],
  );

  // Get chunks around camera position
  const getVisibleChunks = useCallback(() => {
    const gameState = gameStateRef.current;
    const camera = cameraRef.current;

    const chunkX = Math.floor(camera.x / gameState.chunkSize);
    const chunkY = Math.floor(camera.y / gameState.chunkSize);

    const chunks = [];

    for (
      let dx = -gameState.renderDistance;
      dx <= gameState.renderDistance;
      dx++
    ) {
      for (
        let dy = -gameState.renderDistance;
        dy <= gameState.renderDistance;
        dy++
      ) {
        const cx = chunkX + dx;
        const cy = chunkY + dy;
        const key = `${cx},${cy}`;

        if (!gameState.rockChunks.has(key)) {
          const newChunk = generateRockChunk(cx, cy);
          gameState.rockChunks.set(key, newChunk);
        }

        chunks.push(gameState.rockChunks.get(key));
      }
    }

    return chunks;
  }, [generateRockChunk]);

  // Update camera to follow hero
  const updateCamera = useCallback(() => {
    const hero = heroRef.current;
    const camera = cameraRef.current;
    const canvas = canvasRef.current;

    if (!canvas) return;

    // Smooth camera following
    const targetX = hero.x - canvas.width / 2;
    const targetY = hero.y - canvas.height / 2;

    camera.x += (targetX - camera.x) * 0.1;
    camera.y += (targetY - camera.y) * 0.1;
  }, []);

  const isInRock = useCallback(
    (x, y) => {
      const gameState = gameStateRef.current;

      // Check if in original sphere
      const distFromCenter = Math.sqrt(
        (x - gameState.centerX) ** 2 + (y - gameState.centerY) ** 2,
      );
      if (distFromCenter <= gameState.sphereRadius) {
        return false;
      }

      // Check if in any tunnel
      for (const tunnel of gameState.tunnels) {
        const distToTunnel = Math.sqrt(
          (x - tunnel.x) ** 2 + (y - tunnel.y) ** 2,
        );
        if (distToTunnel <= tunnel.radius) {
          return false;
        }
      }

      // Check procedural rock
      return getRockDensity(x, y) > 0;
    },
    [getRockDensity],
  );

  const findEmptySpaceForRock = useCallback(
    (gameState, rockRadius, targetX, targetY) => {
      const maxAttempts = 50;
      const hero = heroRef.current;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Generate random position around the target location
        const angle = Math.random() * Math.PI * 2;
        const distance = rockRadius * 3 + Math.random() * 100;

        const x = targetX + Math.cos(angle) * distance;
        const y = targetY + Math.sin(angle) * distance;

        // Check if the entire rock would fit in empty space
        let hasEnoughSpace = true;
        const checkPoints = 16;

        for (let i = 0; i < checkPoints; i++) {
          const checkAngle = (i / checkPoints) * Math.PI * 2;
          const checkX = x + Math.cos(checkAngle) * rockRadius;
          const checkY = y + Math.sin(checkAngle) * rockRadius;

          if (isInRock(checkX, checkY)) {
            hasEnoughSpace = false;
            break;
          }
        }

        if (!hasEnoughSpace) continue;

        // Check if this position is clear of existing rock piles
        let isValidPosition = true;

        for (const pile of gameState.rockPiles) {
          const dist = Math.sqrt((x - pile.x) ** 2 + (y - pile.y) ** 2);
          if (dist < pile.radius + rockRadius + 10) {
            isValidPosition = false;
            break;
          }
        }

        if (!isValidPosition) continue;

        // Check distance from hero
        const distFromHero = Math.sqrt((x - hero.x) ** 2 + (y - hero.y) ** 2);
        if (distFromHero < hero.radius + rockRadius + 15) {
          isValidPosition = false;
          continue;
        }

        if (isValidPosition) {
          return { x, y };
        }
      }

      return null; // No valid position found
    },
    [isInRock],
  );

  const hasPathToRock = useCallback(
    (heroX, heroY, rockX, rockY, rockRadius) => {
      const steps = 20;
      const dx = rockX - heroX;
      const dy = rockY - heroY;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const checkX = heroX + dx * t;
        const checkY = heroY + dy * t;

        // Stop checking when we reach the rock pile edge
        const distToRock = Math.sqrt(
          (checkX - rockX) ** 2 + (checkY - rockY) ** 2,
        );
        if (distToRock <= rockRadius) {
          break;
        }

        if (isInRock(checkX, checkY)) {
          return false;
        }
      }

      return true;
    },
    [isInRock],
  );

  const digTunnel = useCallback(
    (x, y) => {
      const gameState = gameStateRef.current;
      const hero = heroRef.current;

      let canDig = false;
      let connectionPoint = null;
      let digType = "rock";
      let targetRockPile = null;

      // Check if hero is in a valid position to dig
      const heroDistFromCenter = Math.sqrt(
        (hero.x - gameState.centerX) ** 2 + (hero.y - gameState.centerY) ** 2,
      );
      let heroInValidPosition =
        heroDistFromCenter <= gameState.sphereRadius ||
        !isInRock(hero.x, hero.y);

      if (!heroInValidPosition) {
        return;
      }

      // Check if we're trying to dig a rock pile
      for (const pile of gameState.rockPiles) {
        const distToPile = Math.sqrt((x - pile.x) ** 2 + (y - pile.y) ** 2);
        if (distToPile <= pile.radius + gameState.digRadius) {
          const distanceToHero = Math.sqrt(
            (hero.x - pile.x) ** 2 + (hero.y - pile.y) ** 2,
          );
          // Check if hero has a clear path to the rock pile
          if (
            distanceToHero <= 120 &&
            hasPathToRock(hero.x, hero.y, pile.x, pile.y, pile.radius)
          ) {
            canDig = true;
            digType = "rockPile";
            targetRockPile = pile;
            break;
          }
        }
      }

      // Check for regular rock digging
      if (!canDig) {
        let hasRockOverlap = false;

        const checkPoints = 12;
        for (let i = 0; i < checkPoints; i++) {
          const angle = (i / checkPoints) * Math.PI * 2;
          const checkX = x + Math.cos(angle) * gameState.digRadius;
          const checkY = y + Math.sin(angle) * gameState.digRadius;

          if (isInRock(checkX, checkY)) {
            hasRockOverlap = true;
            break;
          }
        }

        if (hasRockOverlap) {
          connectionPoint = { x: hero.x, y: hero.y };
          const distanceToClick = Math.sqrt(
            (hero.x - x) ** 2 + (hero.y - y) ** 2,
          );
          if (distanceToClick <= 120) {
            canDig = true;
            digType = "rock";
          }
        }
      }

      if (canDig) {
        if (digType === "rockPile") {
          const newPosition = findEmptySpaceForRock(
            gameState,
            targetRockPile.radius,
            targetRockPile.x,
            targetRockPile.y,
          );
          if (newPosition) {
            targetRockPile.x = newPosition.x;
            targetRockPile.y = newPosition.y;
            targetRockPile.timestamp = Date.now();

            gameState.isDigging = true;
            setTimeout(() => {
              gameState.isDigging = false;
            }, 200);
          }
        } else if (digType === "rock") {
          const startX = connectionPoint.x;
          const startY = connectionPoint.y;
          const endX = x;
          const endY = y;

          const distance = Math.sqrt(
            (endX - startX) ** 2 + (endY - startY) ** 2,
          );
          const segments = Math.max(
            1,
            Math.floor(distance / (gameState.digRadius * 1.2)),
          );

          let totalRockVolume = 0;

          for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const segmentX = startX + (endX - startX) * t;
            const segmentY = startY + (endY - startY) * t;

            let alreadyExists = false;
            for (const tunnel of gameState.tunnels) {
              const dist = Math.sqrt(
                (segmentX - tunnel.x) ** 2 + (segmentY - tunnel.y) ** 2,
              );
              if (dist < gameState.digRadius * 0.8) {
                alreadyExists = true;
                break;
              }
            }

            if (!alreadyExists && isInRock(segmentX, segmentY)) {
              const tunnel = {
                id: Date.now() + i,
                x: segmentX,
                y: segmentY,
                radius: gameState.digRadius,
                timestamp: Date.now(),
                segment: i,
                totalSegments: segments,
              };

              gameState.tunnels.push(tunnel);
              totalRockVolume +=
                Math.PI * gameState.digRadius * gameState.digRadius;
            }
          }

          if (totalRockVolume > 0) {
            const rockPileRadius = Math.sqrt(totalRockVolume / Math.PI) * 0.6;
            const rockPosition = findEmptySpaceForRock(
              gameState,
              rockPileRadius,
              x,
              y,
            );

            if (rockPosition) {
              const rockPile = {
                id: Date.now() + 1000,
                x: rockPosition.x,
                y: rockPosition.y,
                radius: rockPileRadius,
                timestamp: Date.now(),
                fromTunnelSegments: segments + 1,
              };

              gameState.rockPiles.push(rockPile);
            }
          }

          gameState.isDigging = true;
          setTimeout(() => {
            gameState.isDigging = false;
          }, 300);
        }
      }
    },
    [findEmptySpaceForRock, isInRock],
  );

  const [isMouseDown, setIsMouseDown] = useState(false);

  const startContinuousDigging = useCallback(() => {
    setIsMouseDown(true);
  }, []);

  const stopContinuousDigging = useCallback(() => {
    setIsMouseDown(false);
  }, []);

  // Initialize canvas and start game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      // Convert screen coordinates to world coordinates
      const screenX = (e.clientX - rect.left) * scaleX;
      const screenY = (e.clientY - rect.top) * scaleY;

      mouseRef.current = {
        x: screenX + cameraRef.current.x,
        y: screenY + cameraRef.current.y,
      };
    };

    const handleMouseDown = (e) => {
      setIsMouseDown(true);

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const screenX = (e.clientX - rect.left) * scaleX;
      const screenY = (e.clientY - rect.top) * scaleY;

      const worldX = screenX + cameraRef.current.x;
      const worldY = screenY + cameraRef.current.y;

      digTunnel(worldX, worldY);
    };

    const handleMouseUp = (e) => {
      setIsMouseDown(false);
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mouseup", handleMouseUp);

    startGameLoop();

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mouseup", handleMouseUp);

      stopGameLoop();
    };
  }, [digTunnel, startContinuousDigging, stopContinuousDigging]);

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

    if (distance > 3) {
      const dirX = dx / distance;
      const dirY = dy / distance;

      const accel =
        distance > 50 ? hero.acceleration : hero.acceleration * (distance / 50);

      hero.vx += dirX * accel;
      hero.vy += dirY * accel;
    } else {
      hero.vx *= 0.8;
      hero.vy *= 0.8;
    }

    hero.vx *= hero.friction;
    hero.vy *= hero.friction;

    if (Math.abs(hero.vx) < hero.stopThreshold) hero.vx = 0;
    if (Math.abs(hero.vy) < hero.stopThreshold) hero.vy = 0;

    const currentSpeed = Math.sqrt(hero.vx * hero.vx + hero.vy * hero.vy);
    if (currentSpeed > hero.maxSpeed) {
      hero.vx = (hero.vx / currentSpeed) * hero.maxSpeed;
      hero.vy = (hero.vy / currentSpeed) * hero.maxSpeed;
    }

    // Store previous position
    const prevX = hero.x;
    const prevY = hero.y;

    // Try to move
    const newX = hero.x + hero.vx;
    const newY = hero.y + hero.vy;

    // Check if new position would be in rock
    if (isInRock(newX, newY)) {
      // Try horizontal movement only
      if (!isInRock(newX, hero.y)) {
        hero.x = newX;
        hero.vy = 0; // Stop vertical movement
      }
      // Try vertical movement only
      else if (!isInRock(hero.x, newY)) {
        hero.y = newY;
        hero.vx = 0; // Stop horizontal movement
      }
      // Can't move in either direction, stop completely
      else {
        hero.vx *= 0.1;
        hero.vy *= 0.1;
      }
    } else {
      // Safe to move to new position
      hero.x = newX;
      hero.y = newY;
    }

    // Check collision with rock piles
    for (const pile of gameState.rockPiles) {
      const distToPile = Math.sqrt(
        (hero.x - pile.x) ** 2 + (hero.y - pile.y) ** 2,
      );
      if (distToPile < pile.radius + hero.radius) {
        const normalX = (hero.x - pile.x) / distToPile;
        const normalY = (hero.y - pile.y) / distToPile;

        hero.x = pile.x + normalX * (pile.radius + hero.radius + 1);
        hero.y = pile.y + normalY * (pile.radius + hero.radius + 1);

        const dotProduct = hero.vx * normalX + hero.vy * normalY;
        hero.vx -= 2 * dotProduct * normalX * 0.6;
        hero.vy -= 2 * dotProduct * normalY * 0.6;
      }
    }

    // Update stats
    setGameStats({
      position: { x: Math.round(hero.x), y: Math.round(hero.y) },
      velocity: {
        x: Math.round(hero.vx * 10) / 10,
        y: Math.round(hero.vy * 10) / 10,
      },
      tunnelsCount: gameState.tunnels.length,
      isDigging: gameState.isDigging,
      chunksGenerated: gameState.rockChunks.size,
    });
  }, [isInRock]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const hero = heroRef.current;
    const gameState = gameStateRef.current;
    const camera = cameraRef.current;

    // Clear canvas
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save context for camera transform
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Get and render visible chunks
    const visibleChunks = getVisibleChunks();

    // Draw procedural rock
    ctx.fillStyle = "#2a2a2a";
    for (const chunk of visibleChunks) {
      for (const pixel of chunk.rockPixels) {
        ctx.fillRect(pixel.x, pixel.y, pixel.size, pixel.size);
      }
    }

    // Draw the original living sphere
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(
      gameState.centerX,
      gameState.centerY,
      gameState.sphereRadius,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Draw tunnels
    ctx.fillStyle = "#1a1a1a";
    for (const tunnel of gameState.tunnels) {
      ctx.beginPath();
      ctx.arc(tunnel.x, tunnel.y, tunnel.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw rock piles
    for (const pile of gameState.rockPiles) {
      ctx.fillStyle = "#4a4a4a";
      ctx.beginPath();
      ctx.arc(pile.x, pile.y, pile.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#666";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(pile.x, pile.y, pile.radius + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw hero
    const heroColor = gameState.isDigging ? "#ffff00" : "#00ff88";
    ctx.fillStyle = heroColor;
    ctx.fillRect(
      hero.x - hero.radius,
      hero.y - hero.radius,
      hero.radius * 2,
      hero.radius * 2,
    );

    const speed = Math.sqrt(hero.vx * hero.vx + hero.vy * hero.vy);
    if (speed > 0.5) {
      ctx.fillStyle = "#ff6600";
      ctx.fillRect(
        hero.x - hero.radius / 2,
        hero.y + hero.radius,
        hero.radius,
        hero.radius / 2,
      );
    }

    // Draw digging indicator
    if (!isInRock(hero.x, hero.y)) {
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(hero.x, hero.y, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Restore context
    ctx.restore();

    // Draw UI elements (screen space)
    const mouse = mouseRef.current;
    const screenMouseX = mouse.x - camera.x;
    const screenMouseY = mouse.y - camera.y;

    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(screenMouseX, screenMouseY, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(screenMouseX - 12, screenMouseY);
    ctx.lineTo(screenMouseX + 12, screenMouseY);
    ctx.moveTo(screenMouseX, screenMouseY - 12);
    ctx.lineTo(screenMouseX, screenMouseY + 12);
    ctx.stroke();
  }, [getVisibleChunks, isInRock]);

  useEffect(() => {
    if (isMouseDown) {
      const mouse = mouseRef.current;
      digTunnel(mouse.x, mouse.y);
    }
  }, [isMouseDown, digTunnel]);

  const startGameLoop = useCallback(() => {
    gameStateRef.current.isRunning = true;

    const gameLoop = () => {
      if (!gameStateRef.current.isRunning) return;

      if (isMouseDown) {
        const mouse = mouseRef.current;
        digTunnel(mouse.x, mouse.y);
      }
      updateHero();
      updateCamera();
      render();
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoop();
  }, [digTunnel, isMouseDown, updateHero, updateCamera, render]);

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-gray-900 min-h-screen">
      <Card className="p-6 bg-gray-800 border-gray-700">
        <h1 className="text-2xl font-bold text-green-400 mb-2 text-center font-mono">
          PROCEDURAL CORE EXPLORER
        </h1>
        <p className="text-gray-300 text-center mb-4 font-mono text-sm">
          Explore infinite procedural rock formations. The map generates as you
          venture further.
        </p>

        <div className="flex gap-4 justify-center text-xs font-mono text-gray-400 mb-4">
          <div>
            POS: {gameStats.position.x}, {gameStats.position.y}
          </div>
          <div>
            VEL: {gameStats.velocity.x}, {gameStats.velocity.y}
          </div>
          <div>TUNNELS: {gameStats.tunnelsCount}</div>
          <div>CHUNKS: {gameStats.chunksGenerated}</div>
          {gameStats.isDigging && (
            <div className="text-yellow-400">DIGGING...</div>
          )}
        </div>
      </Card>

      <Card className="p-2 bg-gray-800 border-gray-700">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className="border border-gray-600 cursor-none bg-black"
          style={{ imageRendering: "pixelated" }}
        />
      </Card>

      <Card className="p-4 bg-gray-800 border-gray-700 max-w-md">
        <h3 className="text-green-400 font-mono font-bold mb-2">MISSION LOG</h3>
        <div className="text-gray-300 text-sm font-mono space-y-1">
          <p>• Mouse controls your vessel - camera follows</p>
          <p>• Click to dig tunnels through procedural rock</p>
          <p>• Venture further to discover infinite worlds</p>
          <p>• Rock formations generate as you explore</p>
          <p>• Find what lies beyond the endless stone...</p>
        </div>
      </Card>
    </div>
  );
};

export default SpaceGame;
