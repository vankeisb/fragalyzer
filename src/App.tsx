import React from 'react';
import './App.scss';
import {Cmd, Dispatcher, just, Maybe, noCmd, nothing, Result, Sub, Task} from "tea-cup-core";
import {DevTools, Program, WindowEvents} from "react-tea-cup";
import {dim, Dim, windowDimensions} from "tea-pop-core";
import {colorToString, drawPositions, getPlayerColor} from "./DrawPositions";
import {getPlayers, getTeams, parseDemo, ParseResult, Positions} from "./Parser";

interface Model {
  readonly state: State;
  readonly error: Maybe<Error>;
}

type State =
    | { tag: 'fresh' }
    | { tag: 'parsing' }
    | { tag: 'ready', parseResult: ParseResult, selectedPlayers: ReadonlySet<string>, canvasDimensions: Dim }

type Msg =
  | { tag: 'window-resized' }
  | { tag: 'got-canvas-dimensions', r: Result<Error, Dim> }
  | { tag: 'file-dropped', file: Maybe<File> }
  | { tag: 'got-parse-result', r: Result<Error, ParseResult> }
  | { tag: 'got-draw-result', r: Result<Error, Positions> }
  | { tag: 'toggle-player', player: string }

const windowResized: Msg = { tag: 'window-resized'}

function gotCanvasDimensions(r: Result<Error,Dim>): Msg {
  return { tag: "got-canvas-dimensions", r };
}

function init(): [Model, Cmd<Msg>] {
  return noCmd(
      {
        state: { tag: "fresh" },
        error: nothing,
      }
  );
}

const canvasId = "csgo-canvas";

const getCanvas: Task<Error, HTMLCanvasElement> = Task.fromLambda(() => {
  const c = document.getElementById(canvasId);
  if (!c) {
    throw new Error("canvas not found");
  }
  return c as HTMLCanvasElement;
})

const getCanvasDimensions: Task<Error, Dim> = getCanvas.map(c => {
  const r = c.getBoundingClientRect();
  return dim(r.width, r.height);
})

function view(dispatch: Dispatcher<Msg>, model: Model) {
  return model.error
    .map(e => (
        <div className="fragalyzer error">
          <h1>Oooops</h1>
          <pre>{e.message}</pre>
        </div>
    ))
    .withDefaultSupply(() => {
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
          const { parseResult, canvasDimensions } = state;
          return (
              <div className="fragalyzer ready">
                <div className="main">
                  <canvas height={canvasDimensions.h} width={canvasDimensions.w} id={canvasId}/>
                  <div className="right-panel">
                    {getTeams(parseResult).map(team => {
                      const teamPlayers = getPlayers(parseResult, team).map(p => p.name);
                      const allPlayers = parseResult.players.map(p => p.name).sort();
                      return (
                          <div key={team} className="team">
                            <h2 className="team">{team} <span className="score">TODO</span></h2>
                            <ul>
                              {teamPlayers.map(player =>
                                  <li key={player}>
                                    <div className="player-color" style={{
                                      backgroundColor: colorToString(getPlayerColor(allPlayers, player), 1.0)
                                    }}/>
                                    <input
                                        type="checkbox"
                                        name={player}
                                        checked={state.selectedPlayers.has(player)}
                                        onChange={e => dispatch({tag: 'toggle-player', player: player})}
                                    />
                                    {player}
                                  </li>
                              )}
                            </ul>
                          </div>
                      );
                    })}
                  </div>
                </div>
                <div className="timeline">
                  TODO
                </div>
              </div>
          );
        }
      }
    })
}

function update(msg: Msg, model: Model): [Model, Cmd<Msg>] {
  switch (msg.tag) {
    case "window-resized": {
      return [model, Task.attempt(getCanvasDimensions, gotCanvasDimensions)];
    }
    case "got-canvas-dimensions": {
      return msg.r.match(
          canvasDimensions => {
            if (model.state.tag === "ready") {
              const { state } = model;
              const newModel: Model = {
                ...model,
                state: {
                  ...state,
                  canvasDimensions,
                }
              };
              return [
                newModel,
                draw(newModel)
              ]
            }
            return noCmd(model);
          },
          err => noCmd({...model, error: just(err)})
      )
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
                  r => ({ tag: "got-parse-result", r })
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
      return msg.r.match(
          parseResult => {
            const selectedPlayers: ReadonlySet<string> = new Set(parseResult.players.map(p => p.name));
            const newModel: Model = {
              ...model,
              state: {
                tag: "ready",
                parseResult,
                selectedPlayers,
                canvasDimensions: Dim.zero,
              }
            };
            return [newModel, Task.attempt(getCanvasDimensions, gotCanvasDimensions)];
          },
          err => noCmd({...model, error: just(err)})
      )


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
    const { selectedPlayers, parseResult } = model.state;
    return drawIntoCanvas(parseResult.positions, selectedPlayers, parseResult.players.map(p => p.name).sort())
  }
  return Cmd.none();
}

function drawIntoCanvas(positions: Positions, selectedPlayers: ReadonlySet<string>, allPlayers: ReadonlyArray<string>): Cmd<Msg> {
  const t: Task<Error, Positions> = Task.fromLambda(() => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error("canvas not found !");
    }
    drawPositions(canvas, positions, selectedPlayers, allPlayers);
    return positions;
  });
  return Task.attempt(t, r => ({
    tag: 'got-draw-result',
    r
  }))
}

const windowEvents = new WindowEvents();

function subscriptions(model: Model): Sub<Msg> {
  return windowEvents.on('resize', () => windowResized)
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
