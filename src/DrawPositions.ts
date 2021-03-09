import * as fs from "fs";
import {DemoFile} from "demofile";
import {Box, Dim, pos, Pos} from "tea-pop-core";

export type Positions = Map<string, Pos[]>;

export function extractPositions(file: File): Promise<Positions> {
  return new Promise<Positions>((resolve, reject) => {
    file.arrayBuffer().then(arrayBuffer => {

      const buffer = Buffer.from(arrayBuffer);

      const demoFile = new DemoFile();

      let nbTicks = 0;
      let start = new Date().getTime();

      demoFile.gameEvents.on("bomb_planted", e => {
        const player = demoFile.entities.getByUserId(e.userid)!;
        console.log(`'${player.name}' planted the bomb at '${player.placeName}'`);
      });

      const positions = new Map<string, Pos[]>();

      demoFile.on("tickend", tick => {
        // console.log("tick", nbTicks, tick);
        nbTicks++;
        const players = demoFile.entities.players;
        if (players && players.length > 0) {
          players.forEach(player => {
            if (player) {
              const p = pos(player.position.x, player.position.y);
              let pps = positions.get(player.name);
              if (pps === undefined) {
                pps = []
                positions.set(player.name, pps);
              }
              pps.push(p)
            }
          })
        }
      })

      demoFile.on("end", e => {
        console.log("done, ticks =", nbTicks, "elapsed =", new Date().getTime() - start);
        console.log("Finished.");
        if (e.error) {
          console.error("Error during parsing:", e.error);
          reject(e)
        } else {
          resolve(positions);
        }
      });

      // Start parsing the buffer now that we've added our event listeners
      demoFile.parse(buffer);
    });
  });
}

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

export function drawPositions(canvas: HTMLCanvasElement, positions: Positions) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw "no context";
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';

  const rect = canvas.getBoundingClientRect();
  const targetMax = Math.min(rect.height, rect.width);
  const normalizedPositions = normalizePositions(targetMax, positions);
  for (let [_, pps] of normalizedPositions.entries()) {
    for (let pp of pps) {
      ctx.fillRect(pp.x, targetMax - pp.y, 2, 2);
    }
  }
}