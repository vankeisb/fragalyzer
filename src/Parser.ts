import {pos, Pos} from "tea-pop-core";
import {DemoFile} from "demofile";


export type Positions = Map<string, Pos[]>;

export interface ParseResult {
  readonly positions: Positions;
  readonly teams: ReadonlyMap<string,string[]>;
}

export function parseDemo(file: File): Promise<ParseResult> {
  return new Promise<ParseResult>((resolve, reject) => {
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
            if (player && !player.isFakePlayer && player.isAlive) {
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

      let teams: Map<string,string[]>;

      demoFile.gameEvents.on('begin_new_match', e => {
        if (!teams) {
          teams = new Map();
          demoFile.teams.forEach(team => {
            if (team && team.clanName) {
              teams.set(team.clanName, team.members.map(member => member.name))
            }
          });
          console.log("teams", teams);
        }
      })

      demoFile.on("end", e => {
        console.log("done, ticks =", nbTicks, "elapsed =", new Date().getTime() - start);
        console.log("Finished.");
        if (e.error) {
          console.error("Error during parsing:", e.error);
          reject(e)
        } else {
          const res = {
            positions,
            teams: teams || new Map(),
          };
          console.log("parsed", res);
          resolve(res);
        }
      });

      // Start parsing the buffer now that we've added our event listeners
      demoFile.parse(buffer);
    });
  });
}

export function filterPositions(positions: Positions, selectedPlayers: ReadonlySet<string>): Positions {
  const newPos: Positions = new Map();
  positions.forEach((pps, player) => {
    if (selectedPlayers.has(player)) {
      newPos.set(player, pps);
    }
  })
  return newPos;
}
