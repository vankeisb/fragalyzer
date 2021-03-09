import {normalize} from "./DrawPositions";

describe("normalize", () => {
  test("same size", () => {
    expect(normalize(0, 100, 50, 100)).toBe(50)
  })
  test("same size negative", () => {
    expect(normalize(-100, 100, -50, 200)).toBe(50)
  })
  test("twice the size 1", () => {
    expect(normalize(0, 200, 50, 100)).toBe(25)
  })
  test("twice the size 2", () => {
    expect(normalize(0, 100, 50, 200)).toBe(100)
  })
})