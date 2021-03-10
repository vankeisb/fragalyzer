import React from 'react';
import './App.css';
import {Cmd, Dispatcher, just, Maybe, noCmd, nothing, Result, Sub, Task} from "tea-cup-core";
import {DevTools, Program, WindowEvents} from "react-tea-cup";
import {Dim, windowDimensions} from "tea-pop-core";
import {drawPositions, extractPositions, Positions} from "./DrawPositions";

interface Model {
  readonly windowDimensions: Dim;
  readonly state: State;
}

type State =
    | { tag: 'fresh' }
    | { tag: 'parsing' }
    | { tag: 'ready', positions: Result<Error,Positions> }

type Msg =
  | { tag: 'got-window-dimensions', d: Dim }
  | { tag: 'file-dropped', file: Maybe<File> }
  | { tag: 'got-positions', positions: Result<Error, Positions> }
  | { tag: 'got-draw-result', r: Result<Error, Positions> }

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
              className="home"
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
      return <p>Parsing, plz wait...</p>
    }
    case "ready": {
      return <canvas height={model.windowDimensions.h} width={model.windowDimensions.w} id={canvasId}/>;
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
      const cmd: Cmd<Msg> =
          model.state.tag === "ready"
              ? model.state.positions.toMaybe().map(drawIntoCanvas).withDefaultSupply(() => Cmd.none())
              : Cmd.none();
      return [
          newModel,
          cmd
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
            const t: Task<Error, Positions> = Task.fromPromise(() =>
              extractPositions(f)
            );
            const cmd: Cmd<Msg> = Task.attempt(t, positions => ({ tag: "got-positions", positions }))
            return [newModel, cmd];
          })
          .withDefaultSupply(() => noCmd({
            ...model,
            state: {
              tag: 'fresh'
            }
          }));
    }
    case "got-positions": {
      const { positions } = msg;
      const cmd: Cmd<Msg> = positions.match(
          drawIntoCanvas,
          err => {
            console.log(err);
            return Cmd.none();
          }
      )
      return [{
        ...model,
        state: {
          tag: "ready",
          positions
        }
      }, cmd];
    }
    case "got-draw-result": {
      console.log("draw res");
      return noCmd(model);
    }
  }
}

function drawIntoCanvas(positions: Positions): Cmd<Msg> {
  const t: Task<Error, Positions> = Task.fromLambda(() => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error("canvas not found !");
    }
    drawPositions(canvas, positions);
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
