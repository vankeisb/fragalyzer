import React from 'react';
import './App.scss';
import {Cmd, Dispatcher, just, Maybe, noCmd, nothing, Result, Sub, Task} from "tea-cup-core";
import {DevTools, Program, WindowEvents} from "react-tea-cup";
import {dim, Dim} from "tea-pop-core";
import {colorToString, drawPositions, getPlayerColor} from "./DrawPositions";
import {getPlayerNames, getPlayersInTeam, getTeams, parseDemo, ParseResult} from "./Parser";

interface Model {
  readonly state: State;
  readonly error: Maybe<Error>;
}

type State =
    | { tag: 'fresh', dragOver: boolean }
    | { tag: 'parsing' }
    | ReadyState

interface ReadyState {
  tag: 'ready';
  readonly canvasDimensions: Dim;
  readonly parseResult: ParseResult;
  readonly selectedPlayers: ReadonlySet<string>;
  readonly selectedRounds: ReadonlySet<number>;
}

type Msg =
  | { tag: 'window-resized' }
  | { tag: 'drag-over', over: boolean }
  | { tag: 'got-canvas-dimensions', r: Result<Error, Dim> }
  | { tag: 'file-dropped', file: Maybe<File> }
  | { tag: 'got-parse-result', r: Result<Error, ParseResult> }
  | { tag: 'got-draw-result', r: Result<Error, ParseResult> }
  | { tag: 'toggle-player', player: string }
  | { tag: 'toggle-round', index: number }

const windowResized: Msg = { tag: 'window-resized'}

function gotCanvasDimensions(r: Result<Error,Dim>): Msg {
  return { tag: "got-canvas-dimensions", r };
}

function init(): [Model, Cmd<Msg>] {
  return noCmd(
      {
        state: { tag: "fresh", dragOver: false },
        error: nothing,
      }
  );
}

const canvasId = "csgo-canvas";
const canvasWrapperId = "canvas-wrapper";

const getCanvasDimensions: Task<Error, Dim> = Task.fromLambda(() => {
  const c = document.getElementById(canvasWrapperId);
  if (!c) {
    throw new Error("canvas wrapper not found");
  }
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
              >
                <h1>CS:GO demo file analyzer</h1>
                <p>
                  <code>fragalyzer</code> is a tool that analyzes a .dem file and
                  draws the paths of players.
                </p>
                <div
                    className={`drop-zone${state.dragOver ? ' drop-over' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      dispatch({
                        tag: 'drag-over',
                        over: true,
                      })
                    }}
                    onDragLeave={() => {
                      dispatch({
                        tag: 'drag-over',
                        over: false,
                      })
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
                  Drop a .dem here get started
                </div>
              </div>
          )
        }
        case "parsing": {
          return <div className="fragalyzer parsing"><p>Parsing demo file. It can take up to a few minutes...</p></div>
        }
        case "ready": {
          const { parseResult, canvasDimensions } = state;
          // const size = Math.min(canvasDimensions.w, canvasDimensions.h);
          return (
              <div className="fragalyzer ready">
                <div className="main">
                  <div id={canvasWrapperId} className="map-view">
                    {/*<div className="map-image">*/}
                    {/*  <img*/}
                    {/*      height={size}*/}
                    {/*      width={size}*/}
                    {/*      src="./maps/mirage.png"*/}
                    {/*  />*/}
                    {/*</div>*/}
                    <canvas
                        height={canvasDimensions.h}
                        width={canvasDimensions.w}
                        id={canvasId}
                    />
                  </div>
                  <div className="right-panel">
                    <h2>Map</h2>
                    <p>
                      {state.parseResult.mapName}
                    </p>
                    {getTeams(parseResult).map(team => {
                      const teamPlayers = getPlayersInTeam(parseResult, team).map(p => p.name);
                      const allPlayers = getPlayerNames(parseResult);
                      return (
                          <div key={team} className="team">
                            <h2 className="team">{team}</h2>
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
                {viewTimeline(dispatch, parseResult, state.selectedRounds)}
              </div>
          );
        }
      }
    })
}

function update(msg: Msg, model: Model): [Model, Cmd<Msg>] {
  switch (msg.tag) {
    case "window-resized": {
      return ifReady(model, () => {
        return [model, Task.attempt(getCanvasDimensions, gotCanvasDimensions)];
      });
    }
    case "drag-over": {
      if (model.state.tag === "fresh") {
        return noCmd({
          ...model,
          state: {
            tag: 'fresh',
            dragOver: true
          }
        })
      }
      return noCmd(model);
    }
    case "got-canvas-dimensions": {
      return msg.r.match(
          canvasDimensions => {
            return ifReady(model, state => {
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
            });
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
              tag: 'fresh',
              dragOver: false,
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
                selectedRounds: new Set(parseResult.rounds.map((r, index) => index)),
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
      return ifReady(model, state => {
        const { selectedPlayers } = state;
        const spa: string[] = selectedPlayers.has(msg.player)
            ? Array.from(selectedPlayers).filter(x => x !== msg.player)
            : [...Array.from(selectedPlayers), msg.player];
        const newModel: Model = setState(model, {
          ...state,
          selectedPlayers: new Set(spa)
        });
        return [newModel, draw(newModel)];
      })
    }
    case "toggle-round": {
      return ifReady(model, state => {
        const { selectedRounds } = state;
        const a = Array.from(selectedRounds);
        const newSelRounds = new Set(
            selectedRounds.has(msg.index)
              ? a.filter(x => x !== msg.index)
              : [...a, msg.index]
        );
        const newModel: Model = setState(model, {
          ...state,
          selectedRounds: newSelRounds
        });
        return [newModel, draw(newModel)];
      })
    }
  }
}

function ifReady(model: Model, f:(state: ReadyState) => [Model, Cmd<Msg>]): [Model, Cmd<Msg>] {
  if (model.state.tag === 'ready') {
    return f(model.state);
  }
  return noCmd(model)
}

function setState(model: Model, state: State): Model {
  return {
    ...model, state
  }
}

function draw(model: Model): Cmd<Msg> {
  if (model.state.tag === "ready") {
    const { selectedPlayers, parseResult, selectedRounds } = model.state;
    return drawIntoCanvas(parseResult, selectedPlayers, selectedRounds)
  }
  return Cmd.none();
}

function drawIntoCanvas(parseResult: ParseResult, selectedPlayers: ReadonlySet<string>, selectedRounds: ReadonlySet<number>): Cmd<Msg> {
  const t: Task<Error, ParseResult> = Task.fromLambda(() => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error("canvas not found !");
    }
    drawPositions(canvas, parseResult, selectedPlayers, selectedRounds);
    return parseResult;
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


function viewTimeline(dispatch: Dispatcher<Msg>, parseResult: ParseResult, selectedRounds: ReadonlySet<number>) {
  return (
    <div className="timeline">
      {parseResult.rounds.map((round, index) => {
        const selected = selectedRounds.has(index);
        const className = `round${selected ? ' selected' : ''}`;
        return (
            <div
                className={className}
                key={index}
                onClick={() => dispatch({tag: 'toggle-round', index})}
            >
              {(index + 1) + " : " + round.scoreCT + "/" + round.scoreT}
            </div>
        )
      })}
    </div>
  );
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
