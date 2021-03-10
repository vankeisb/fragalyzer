import {pos, Pos} from "tea-pop-core";
import {DemoFile} from "demofile";


export type Positions = Map<string, Pos[]>;

export interface Player {
  readonly name: string;
  readonly team: string;
}

export interface ParseResult {
  readonly positions: Positions;
  readonly players: ReadonlyArray<Player>;
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

      let players: Player[];

      demoFile.gameEvents.on('begin_new_match', e => {
        debugger;
        if (players === undefined) {
          players = [];
          players = demoFile.players.filter(p => !p.isFakePlayer).map(p => {
            const team = p.team;
            const teamName = team
                ? (team.clanName || p.teamNumber.toString())
                : p.teamNumber.toString();
            return {
              name: p.name,
              team: teamName,
            };
          });
          console.log("players", players);
        }
      })

      // demoFile.userMessages.on('EndOfMatchAllPlayersData', e => {
      //   debugger;
      //   e.allplayerdata.forEach(playerData => {
      //     console.log(playerData.playercolor);
      //   })
      // });

      demoFile.on("end", e => {
        console.log("done, ticks =", nbTicks, "elapsed =", new Date().getTime() - start);
        console.log("Finished.");
        if (e.error) {
          console.error("Error during parsing:", e.error);
          reject(e)
        } else {
          const res = {
            positions,
            players,
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

export function getTeams(parseResult: ParseResult): ReadonlyArray<string> {
  const s = new Set<string>();
  parseResult.players.forEach(player => {
    s.add(player.team);
  })
  return Array.from(s).sort();
}

export function getPlayers(parseResult: ParseResult, team: string): ReadonlyArray<Player> {
  const res = new Array<Player>();
  parseResult.players.forEach(p => {
    if (p.team === team) {
      res.push(p);
    }
  })
  return res.sort((a, b) => a.name.localeCompare(b.name));
}
