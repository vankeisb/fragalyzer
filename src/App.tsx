import React from 'react';
import './App.scss';
import {Cmd, Dispatcher, just, Maybe, noCmd, nothing, Result, Sub, Task} from "tea-cup-core";
import {DevTools, Program, WindowEvents} from "react-tea-cup";
import {Dim, windowDimensions} from "tea-pop-core";
import {drawPositions} from "./DrawPositions";
import {parseDemo, ParseResult, Positions} from "./Parser";

interface Model {
  readonly windowDimensions: Dim;
  readonly state: State;
}

type State =
    | { tag: 'fresh' }
    | { tag: 'parsing' }
    | { tag: 'ready', parseResult: Result<Error,ParseResult>, selectedPlayers: ReadonlySet<string> }

type Msg =
  | { tag: 'got-window-dimensions', d: Dim }
  | { tag: 'file-dropped', file: Maybe<File> }
  | { tag: 'got-parse-result', parseResult: Result<Error, ParseResult> }
  | { tag: 'got-draw-result', r: Result<Error, Positions> }
  | { tag: 'toggle-player', player: string }

function gotWindowDimensions(d:Dim): Msg {
  return { tag: "got-window-dimensions", d };
}

function init(): [Model, Cmd<Msg>] {
  return [
      {
        state: { tag: "fresh" },
        windowDimensions: Dim.zero,
      },
      Task.perform(
          Task.succeedLazy(() => windowDimensions()),
          gotWindowDimensions
      )
  ]
}

const canvasId = "csgo-canvas";

function view(dispatch: Dispatcher<Msg>, model: Model) {
  const { state } = model;
  switch (state.tag) {
    case "fresh": {
      return (
          <div
              className="fragalyzer home"
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDropCapture={e => {
                e.preventDefault();
                const msg: Msg = {
                  tag: 'file-dropped',
                  file: nothing
                };
                if (e.dataTransfer.files.length === 1) {
                  const f = e.dataTransfer.files.item(0);
                  if (f) {
                    dispatch({
                      ...msg,
                      file: just(f)
                    })
                  } else {
                    dispatch(msg)
                  }
                } else {
                  dispatch(msg);
                }
              }}
          >
            Drop a demo here !
          </div>
      )
    }
    case "parsing": {
      return <div className="fragalyzer parsing"><p>Parsing, plz wait...</p></div>
    }
    case "ready": {
      return state.parseResult.match(
          parseResult => (
              <div className="fragalyzer ready">
                <canvas height={model.windowDimensions.h} width={model.windowDimensions.w} id={canvasId}/>
                <div className="right-panel">
                  {Array.from(parseResult.teams.entries()).map(([team, players]) =>
                    <div key={team} className="team">
                      <h2>{team}</h2>
                      <ul>
                        {players.map(player =>
                          <li key={player}>
                            <input
                                type="checkbox"
                                name={player}
                                checked={state.selectedPlayers.has(player)}
                                onChange={e => dispatch({tag: 'toggle-player', player})}
                            />
                            {player}
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
          ),
          error => (
              <div className="fragalyzer error">
                <h1>Oooops</h1>
                <p>An error occured :</p>
                <pre>
                  {error.message}
                </pre>
              </div>
          )
      )
    }
  }
}

function update(msg: Msg, model: Model): [Model, Cmd<Msg>] {
  switch (msg.tag) {
    case "got-window-dimensions": {
      const newModel: Model = {
        ...model,
        windowDimensions: msg.d
      };
      return [
          newModel,
          draw(newModel)
      ]
    }
    case "file-dropped": {
      return msg.file
          .map<[Model, Cmd<Msg>]>(f => {
            const newModel: Model = {
              ...model,
              state: {
                tag: 'parsing'
              }
            };
            const t: Task<Error, ParseResult> = Task.fromPromise(() =>
              parseDemo(f)
            );
            const cmd: Cmd<Msg> =
                Task.attempt(
                    t,
                    parseResult => ({ tag: "got-parse-result", parseResult })
                )
            return [newModel, cmd];
          })
          .withDefaultSupply(() => noCmd({
            ...model,
            state: {
              tag: 'fresh'
            }
          }));
    }
    case "got-parse-result": {
      const { parseResult } = msg;
      const selectedPlayers: ReadonlySet<string> = parseResult.match(
          pr => {
            // collect all players and team names
            const s: Set<string> = new Set();
            for (let players of pr.teams.values()) {
              for (let player of players) {
                s.add(player);
              }
            }
            return s;
          },
          () => new Set()
      );
      const newModel: Model = {
        ...model,
        state: {
          tag: "ready",
          parseResult,
          selectedPlayers
        }
      };
      return [newModel, draw(newModel)];
    }
    case "got-draw-result": {
      console.log("draw res");
      return noCmd(model);
    }
    case "toggle-player": {
      if (model.state.tag === "ready") {
        const { selectedPlayers } = model.state;
        const spa: string[] = selectedPlayers.has(msg.player)
          ? Array.from(selectedPlayers).filter(x => x !== msg.player)
          : [...Array.from(selectedPlayers), msg.player];
        const newState = {
          ...model.state,
          selectedPlayers: new Set(spa)
        }
        const newModel = {
          ...model,
          state: newState,
        }
        return [newModel, draw(newModel)];
      }
      return noCmd(model);
    }
  }
}

function draw(model: Model): Cmd<Msg> {
  if (model.state.tag === "ready") {
    const { selectedPlayers } = model.state;
    return model.state.parseResult.match(
        parseResult => drawIntoCanvas(parseResult.positions, selectedPlayers),
        err => Cmd.none()
    )
  }
  return Cmd.none();
}

function drawIntoCanvas(positions: Positions, selectedPlayers: ReadonlySet<string>): Cmd<Msg> {
  const t: Task<Error, Positions> = Task.fromLambda(() => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error("canvas not found !");
    }
    drawPositions(canvas, positions, selectedPlayers);
    return positions;
  });
  return Task.attempt(t, r => ({
    tag: 'got-draw-result',
    r
  }))
}

const windowEvents = new WindowEvents();

function subscriptions(model: Model): Sub<Msg> {
  return windowEvents.on('resize', () => gotWindowDimensions(windowDimensions()))
}


function App() {
  return (
      <Program
          init={init}
          view={view}
          update={update}
          subscriptions={subscriptions}
          devTools={DevTools.init<Model, Msg>(window)}
      />
  );
}

export default App;
