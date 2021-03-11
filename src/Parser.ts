import {pos, Pos} from "tea-pop-core";
import {DemoFile} from "demofile";


export type Positions = Map<string, FPos[]>;

export interface FPos {
  readonly p: Pos;
  readonly tick: number;
}

export interface FPlayer {
  readonly name: string;
  readonly clanName: string;
}

export interface FRound {
  readonly startTick: number;
  readonly endTick: number;
  readonly winner: number;
  readonly clanT: string;
  readonly scoreT: number;
  readonly clanCT: string;
  readonly scoreCT: number;
}

export interface ParseResult {
  readonly positions: Positions;
  readonly players: ReadonlyArray<FPlayer>;
  readonly rounds: ReadonlyArray<FRound>;
}

export function parseDemo(file: File): Promise<ParseResult> {
  return new Promise<ParseResult>((resolve, reject) => {
    file.arrayBuffer().then(arrayBuffer => {

      const buffer = Buffer.from(arrayBuffer);

      const demoFile = new DemoFile();

      let nbTicks = 0;
      let start = new Date().getTime();

      const positions = new Map<string, FPos[]>();

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
              const fp: FPos = {
                p,
                tick,
              }
              pps.push(fp)
            }
          })
        }
      })

      let players: FPlayer[];
      const rounds: FRound[] = [];
      let winner: number = 0;

      demoFile.gameEvents.on('begin_new_match', e => {
        console.log("begin match");
        if (players === undefined) {
          players = [];
          const dfps = demoFile.players;
          players = dfps.filter(p => !p.isFakePlayer && p.teamNumber >= 2).map(p => {
            const team = p.team;
            return {
              name: p.name,
              clanName: team?.clanName || p.teamNumber.toString(),
            };
          });
          console.log("players", players);
        }
      })

      let roundStartTick: number = 0;

      demoFile.gameEvents.on("round_start", () => {
        console.log("round start");
        roundStartTick = demoFile.currentTick;
      })

      demoFile.gameEvents.on("round_end", e => {
        console.log("round end", e.winner)
        winner = e.winner;
      })

      demoFile.gameEvents.on('round_officially_ended', e => {
        console.log("round officially ended");
        const teams = demoFile.teams;

        const terrorists = teams[2];
        const cts = teams[3];

        console.log(
            "\t%s: %s score %d\n\t%s: %s score %d",
            terrorists.teamName,
            terrorists.clanName,
            terrorists.score,
            cts.teamName,
            cts.clanName,
            cts.score
        );
        rounds.push({
          startTick: roundStartTick,
          endTick: demoFile.currentTick,
          winner,
          scoreCT: cts.score,
          clanCT: cts.clanName,
          scoreT: terrorists.score,
          clanT: terrorists.clanName,
        })
      })

      demoFile.gameEvents.on('round_start', e => {
        winner = 0;
        console.log("round start", demoFile.gameRules.roundsPlayed)
        // rounds.push({
        //   index: demoFile.gameRules.roundsPlayed
        // })
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
          const res: ParseResult = {
            positions,
            players,
            rounds,
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

export type TickRange = [startTick: number, endTick: number];

export function filterPositions(positions: Positions, selectedPlayers: ReadonlySet<string>, selectedTicks: ReadonlyArray<TickRange>): Positions {
  const newPos: Positions = new Map();
  positions.forEach((pps, player) => {
    if (selectedPlayers.has(player)) {
      newPos.set(player, pps.filter(p => {
        const matchingTr = selectedTicks.find(tr => p.tick >= tr[0] && p.tick <= tr[1]);
        return matchingTr !== undefined;
      }));
    }
  })
  return newPos;
}

export function getTeams(parseResult: ParseResult): ReadonlyArray<string> {
  const s = new Set<string>();
  parseResult.players.forEach(player => {
    s.add(player.clanName);
  })
  return Array.from(s).sort();
}

export function getPlayersInTeam(parseResult: ParseResult, team: string): ReadonlyArray<FPlayer> {
  const res = new Array<FPlayer>();
  parseResult.players.forEach(p => {
    if (p.clanName === team) {
      res.push(p);
    }
  })
  return res.sort((a, b) => a.name.localeCompare(b.name));
}

export function getPlayerNames(parseResult: ParseResult): ReadonlyArray<string> {
  return parseResult.players.map(p => p.name).sort();
}
