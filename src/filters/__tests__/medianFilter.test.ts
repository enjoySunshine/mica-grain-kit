import { expect, test } from 'vitest';

import type { Image } from '../../Image.ts';

test('grey image 5x5', () => {
  const image = testUtils.createGreyImage([
    [1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5],
  ]);

  const result = image.medianFilter({
    borderType: 'reflect101',
    cellSize: 3,
    borderValue: 0,
  });

  expect(result).toMatchImageData([
    [2, 2, 3, 4, 4],
    [2, 2, 3, 4, 4],
    [2, 2, 3, 4, 4],
    [2, 2, 3, 4, 4],
    [2, 2, 3, 4, 4],
  ]);
});

test('grey image 5x5 with bigger values', () => {
  const image = testUtils.createGreyImage([
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
  ]);
  const result = image.medianFilter({
    borderType: 'reflect101',
    cellSize: 1,
    borderValue: 0,
  });

  expect(result).toMatchImageData([
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
  ]);
});

test('grey image 5x5 with different borderType and borderValue', () => {
  const image = testUtils.createGreyImage([
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
  ]);
  const result = image.medianFilter({
    borderType: 'constant',
    cellSize: 7,
    borderValue: 1,
  });

  expect(result).toMatchImageData([
    [1, 1, 1, 1, 1],
    [1, 2, 2, 2, 1],
    [1, 2, 2, 2, 1],
    [1, 2, 2, 2, 1],
    [1, 1, 1, 1, 1],
  ]);
});

test('error handling', () => {
  const image = testUtils.createGreyImage([
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
    [10, 2, 20, 4, 5],
  ]);

  expect(() => {
    image.medianFilter({
      borderType: 'constant',
      cellSize: 2,
      borderValue: 1,
    });
  }).toThrow(
    new RangeError(
      'Invalid property "cellSize". Must be an odd number. Received 2.',
    ),
  );

  expect(() => {
    image.medianFilter({
      borderType: 'constant',
      cellSize: 0,
      borderValue: 1,
    });
  }).toThrow(
    new RangeError(
      'Invalid property "cellSize". Must be greater than 0. Received 0.',
    ),
  );
});

function gradientImage(size = 5): Image {
  const image = testUtils.createGreyImage(
    Array.from({ length: size }, () => Array.from({ length: size }, () => 0)),
  );
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      image.setValue(column, row, 0, ((row * 7 + column * 11) % 180) + 30);
    }
  }
  return image;
}

test('gradient 5x5 with constant 0 border', () => {
  const image = gradientImage();

  expect(image.getRow(0)[0]).toStrictEqual([30, 41, 52, 63, 74]);

  const result = image.medianFilter({
    borderType: 'constant',
    cellSize: 3,
    borderValue: 0,
  });

  expect(result).toMatchImageData([
    [0, 37, 48, 59, 0],
    [37, 48, 59, 70, 70],
    [44, 55, 66, 77, 77],
    [51, 62, 73, 84, 84],
    [0, 58, 69, 80, 0],
  ]);
  expect(result.getValue(0, 0, 0)).toBe(0);
  expect(result.getValue(4, 4, 0)).toBe(0);
  expect(result.getValue(2, 2, 0)).toBe(66);
});

test('gradient 5x5 with reflect101 border', () => {
  const image = gradientImage();
  const result = image.medianFilter({ borderType: 'reflect101', cellSize: 3 });

  expect(result).toMatchImageData([
    [41, 48, 59, 70, 70],
    [44, 48, 59, 70, 74],
    [51, 55, 66, 77, 81],
    [58, 62, 73, 84, 88],
    [62, 62, 73, 84, 91],
  ]);
  expect(result.getValue(0, 0, 0)).toBe(41);
  expect(result.getValue(4, 4, 0)).toBe(91);
});

test('3x3 with 0 and 255 values and constant 0 border', () => {
  const image = testUtils.createGreyImage([
    [0, 255, 10],
    [200, 1, 255],
    [30, 0, 180],
  ]);
  const result = image.medianFilter({
    borderType: 'constant',
    cellSize: 3,
    borderValue: 0,
  });

  expect(result).toMatchImageData([
    [0, 1, 0],
    [0, 30, 1],
    [0, 1, 0],
  ]);
  expect(result.getValue(1, 1, 0)).toBe(30);
  expect(result.getValue(1, 0, 0)).toBe(1);
});

test('16 bit 3x3 with constant 0 border', () => {
  const image = testUtils.createGreyImage(
    [
      [1000, 20, 40000],
      [7, 300, 65535],
      [80, 5000, 9],
    ],
    { bitDepth: 16 },
  );
  const result = image.medianFilter({
    borderType: 'constant',
    cellSize: 3,
    borderValue: 0,
  });

  expect(result).toMatchImageData([
    [0, 20, 0],
    [20, 300, 20],
    [0, 9, 0],
  ]);
  expect(result.getValue(1, 1, 0)).toBe(300);
  expect(result.getValue(1, 0, 0)).toBe(20);

  const unchanged = image.medianFilter({ cellSize: 1 });

  expect(unchanged).toMatchImage(image);
});

test('480x480 image with a 13x13 cell', () => {
  const image = gradientImage(480);
  const result = image.medianFilter({
    borderType: 'constant',
    cellSize: 13,
    borderValue: 0,
  });

  expect(result.getValue(0, 0, 0)).toBe(0);
  expect(result.getValue(479, 479, 0)).toBe(0);
  expect(image.getValue(6, 6, 0)).toBe(138);
  expect(result.getValue(6, 6, 0)).toBe(126);
  expect(image.getValue(40, 25, 0)).toBe(105);
  expect(result.getValue(40, 25, 0)).toBe(114);
  expect(image.getValue(240, 240, 0)).toBe(30);
  expect(result.getValue(240, 240, 0)).toBe(120);
});

test('cell sliding does not depend on the window position', () => {
  // Values that make the median move a lot from one position to the next.
  const rows = 20;
  const columns = 60;
  const data = [];
  for (let row = 0; row < rows; row++) {
    const values = [];
    for (let column = 0; column < columns; column++) {
      values.push(column < columns / 2 ? 0 : 255);
    }
    data.push(values);
  }
  const image = testUtils.createGreyImage(data);
  const result = image.medianFilter({ cellSize: 5, borderType: 'replicate' });
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const values = [];
      for (let cellRow = -2; cellRow <= 2; cellRow++) {
        for (let cellColumn = -2; cellColumn <= 2; cellColumn++) {
          const column2 = Math.min(
            Math.max(column + cellColumn, 0),
            columns - 1,
          );
          const row2 = Math.min(Math.max(row + cellRow, 0), rows - 1);
          values.push(image.getValue(column2, row2, 0));
        }
      }
      values.sort((a, b) => a - b);

      expect(result.getValue(column, row, 0)).toBe(values[12]);
    }
  }
});
