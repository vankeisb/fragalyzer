import * as fs from "fs";
import {DemoFile} from "demofile";
import {Box, Dim, pos, Pos} from "tea-pop-core";
import {filterPositions, Positions} from "./Parser";

export function normalize(srcMin: number, srcMax: number, srcValue: number, targetMax: number): number {
  const srcLen = srcMax - srcMin;
  const translateX = -srcMin;
  const scaleFactor = srcLen / targetMax;
  const translatedValue = srcValue + translateX;
  return translatedValue / scaleFactor;
}

export function normalizePositions(targetMax: number, positions: Positions): Positions {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  // first loop, to get min/max values
  for (let p of positions.entries()) {
    for (let playerPos of p[1]) {
      minX = Math.min(playerPos.x, minX);
      maxX = Math.max(playerPos.x, maxX);
      minY = Math.min(playerPos.y, minY);
      maxY = Math.max(playerPos.y, maxY);
    }
  }

  const res: Positions = new Map<string, Pos[]>();
  // loop again and recreate map with normalized positions
  for (let [playerName, playerPositions] of positions.entries()) {
    res.set(playerName, playerPositions.map(pp =>
        pos(
          normalize(minX, maxX, pp.x, targetMax),
          normalize(minY, maxY, pp.y, targetMax),
        )
    ));
  }
  return res;
}

const colors: ReadonlyArray<string> = [
  [0, 140, 255],
  [255, 140, 255],
  [255, 0, 255],
  [255, 0, 0],
  [255, 132, 97],
  [0, 183, 32],
  [238, 183, 32],
  [10, 183, 164],
  [198, 197, 0],
  [42, 197, 255],
  [221, 91, 90]
].map(([r,g,b]) => `rgba(${r},${g},${b},0.05)`);


export function drawPositions(canvas: HTMLCanvasElement, positions: Positions, selectedPlayers: ReadonlySet<string>) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw "no context";
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let colorIndex = 0;
  const playerColors: Map<string, string> = new Map();
  for (let playerName of positions.keys()) {
    playerColors.set(playerName, colors[colorIndex]);
    colorIndex++;
  }

  const rect = canvas.getBoundingClientRect();
  const targetMax = Math.min(rect.height, rect.width);
  const normalizedPositions = normalizePositions(targetMax, positions);
  for (let [playerName, pps] of filterPositions(normalizedPositions, selectedPlayers).entries()) {
    ctx.fillStyle = playerColors.get(playerName) ?? 'rgba(0, 0, 0, 0.2)';
    for (let pp of pps) {
      ctx.fillRect(pp.x, targetMax - pp.y, 2, 2);
    }
  }
}
