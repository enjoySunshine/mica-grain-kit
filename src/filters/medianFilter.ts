import { Image } from '../Image.ts';
import { getDefaultColor } from '../utils/getDefaultColor.ts';
import type { BorderType } from '../utils/interpolateBorder.ts';
import { getBorderInterpolation } from '../utils/interpolateBorder.ts';
import checkProcessable from '../utils/validators/checkProcessable.ts';

export interface MedianFilterOptions {
  /**
   * Type of border algorithm to interpolate from.
   * @default `'reflect101'`
   */
  borderType?: BorderType;
  /**
   * Value of border.
   */
  borderValue?: number | number[];
  /**
   * The radius of the cell to extract median value from. Must be odd.
   *  @default `3`
   */
  cellSize?: number;
}
/**
 * Calculate a new image that replaces all pixel values by the median of neighbouring pixels.
 * The median is the lower middle value: for an even number of values, the value at
 * index `Math.floor(windowSize / 2)` of the sorted values is returned.
 * @param image - Image to be filtered.
 * @param options - MedianFilterOptions
 * @returns Image after median filter.
 */
export function medianFilter(image: Image, options: MedianFilterOptions = {}) {
  const {
    cellSize = 3,
    borderType = 'reflect101',
    borderValue = getDefaultColor(image),
  } = options;

  checkProcessable(image, {
    bitDepth: [8, 16],
  });

  if (cellSize < 1) {
    throw new RangeError(
      `Invalid property "cellSize". Must be greater than 0. Received ${cellSize}.`,
    );
  }

  if (cellSize % 2 === 0) {
    throw new RangeError(
      `Invalid property "cellSize". Must be an odd number. Received ${cellSize}.`,
    );
  }

  const newImage = Image.createFrom(image);
  const { width, height, channels, bitDepth } = image;
  const outData = newImage.getRawImage().data;
  const data = image.getRawImage().data;

  if (cellSize === 1) {
    // Each window only contains the pixel itself, so the image is unchanged.
    outData.set(data);
    return newImage;
  }

  const interpolateBorder = getBorderInterpolation(borderType, borderValue);
  const halfCellSize = (cellSize - 1) / 2;
  const windowSize = cellSize * cellSize;
  const middleIndex = (windowSize - 1) / 2;

  // Copy of the image with the interpolated border, so that reading a window
  // is a plain memory access.
  const paddedWidth = width + cellSize - 1;
  const paddedHeight = height + cellSize - 1;

  // Number of possible values. The window is the only content of the
  // histogram, so one histogram for all values is enough.
  const histogramSize = bitDepth === 8 ? 256 : 65536;

  for (let channel = 0; channel < channels; channel++) {
    const padded =
      bitDepth === 8
        ? new Uint8Array(paddedWidth * paddedHeight)
        : new Uint16Array(paddedWidth * paddedHeight);
    for (let paddedRow = 0; paddedRow < paddedHeight; paddedRow++) {
      const row = paddedRow - halfCellSize;
      const paddedBase = paddedRow * paddedWidth;
      if (row >= 0 && row < height) {
        for (let paddedColumn = 0; paddedColumn < paddedWidth; paddedColumn++) {
          const column = paddedColumn - halfCellSize;
          if (column >= 0 && column < width) {
            padded[paddedBase + paddedColumn] =
              data[(row * width + column) * channels + channel];
          } else {
            padded[paddedBase + paddedColumn] = interpolateBorder(
              column,
              row,
              channel,
              image,
            );
          }
        }
      } else {
        for (let paddedColumn = 0; paddedColumn < paddedWidth; paddedColumn++) {
          padded[paddedBase + paddedColumn] = interpolateBorder(
            paddedColumn - halfCellSize,
            row,
            channel,
            image,
          );
        }
      }
    }

    const selector = new MedianSelector(histogramSize);
    // Values of the leftmost window of the current row, by window row. They
    // are removed from the histogram when the window slides to the right.
    const leavingValues = new Uint16Array(cellSize);

    for (let row = 0; row < height; row++) {
      // Initialize the histogram with the window centered on (0, row).
      for (let cellRow = 0; cellRow < cellSize; cellRow++) {
        const paddedBase = (row + cellRow) * paddedWidth;
        for (let cellColumn = 0; cellColumn < cellSize; cellColumn++) {
          selector.add(padded[paddedBase + cellColumn]);
        }
        leavingValues[cellRow] = padded[paddedBase];
      }

      let outIndex = row * width * channels + channel;
      outData[outIndex] = selector.median(middleIndex);

      for (let column = 1; column < width; column++) {
        // Slide the window one pixel to the right: add the values of the
        // entering column and remove the values of the leaving one. The value
        // that will leave on the next slide is stored for that next step.
        const enteringColumn = column + cellSize - 1;
        for (let cellRow = 0; cellRow < cellSize; cellRow++) {
          const paddedBase = (row + cellRow) * paddedWidth;
          selector.add(padded[paddedBase + enteringColumn]);
          selector.remove(leavingValues[cellRow]);
          leavingValues[cellRow] = padded[paddedBase + column];
        }

        outIndex += channels;
        outData[outIndex] = selector.median(middleIndex);
      }

      // Empty the histogram before starting the next row.
      const lastColumn = width - 1;
      for (let cellRow = 0; cellRow < cellSize; cellRow++) {
        const paddedBase = (row + cellRow) * paddedWidth;
        for (let cellColumn = 0; cellColumn < cellSize; cellColumn++) {
          selector.remove(padded[paddedBase + lastColumn + cellColumn]);
        }
      }
    }
  }
  return newImage;
}

/**
 * Finds the n-th smallest value of a multiset of integers, updated one value at
 * a time. It allows the median of a window to follow the window as it slides
 * without sorting the window again.
 *
 * For 8-bit images, the number of values that are smaller than the current
 * result is tracked, so the result only moves by a few values on each update.
 *
 * For 16-bit images the histogram has too many entries for that. A two-level
 * histogram is used instead: one count per group of 4096 values, one per group
 * of 256 values and one per value. The rank is first located in the coarse
 * groups, so that only the values of one group have to be looked at.
 */
class MedianSelector {
  private readonly counts: Uint32Array;
  private readonly middleGroups: Uint32Array | undefined;
  private readonly largeGroups: Uint32Array | undefined;

  // Result of the last search and number of values below it.
  private currentValue = 0;
  private below = 0;

  /**
   * Create a selector for a given range of values.
   * @param size - Number of possible values.
   */
  public constructor(size: number) {
    this.counts = new Uint32Array(size);
    if (size > 256) {
      this.middleGroups = new Uint32Array(size >> 8);
      this.largeGroups = new Uint32Array(size >> 12);
    }
  }

  /**
   * Add one occurrence of a value.
   * @param value - The value.
   */
  public add(value: number) {
    this.counts[value]++;
    if (value < this.currentValue) this.below++;
    if (this.middleGroups && this.largeGroups) {
      this.middleGroups[value >> 8]++;
      this.largeGroups[value >> 12]++;
    }
  }

  /**
   * Remove one occurrence of a value.
   * @param value - The value.
   */
  public remove(value: number) {
    this.counts[value]--;
    if (value < this.currentValue) this.below--;
    if (this.middleGroups && this.largeGroups) {
      this.middleGroups[value >> 8]--;
      this.largeGroups[value >> 12]--;
    }
  }

  /**
   * Get the n-th smallest value, `0` being the smallest.
   * @param index - Rank of the wanted value.
   * @returns The value.
   */
  public median(index: number): number {
    if (this.middleGroups && this.largeGroups) {
      return this.medianWithGroups(index);
    }
    let value = this.currentValue;
    let below = this.below;
    while (below > index) {
      value--;
      below -= this.counts[value];
    }
    while (below + this.counts[value] <= index) {
      below += this.counts[value];
      value++;
    }
    this.currentValue = value;
    this.below = below;
    return value;
  }

  private medianWithGroups(index: number): number {
    const counts = this.counts;
    const middleGroups = this.middleGroups as Uint32Array;
    const largeGroups = this.largeGroups as Uint32Array;

    let below = 0;
    let group = 0;
    while (below + largeGroups[group] <= index) {
      below += largeGroups[group];
      group++;
    }
    // Search inside the large group, one middle group at a time.
    let middleGroup = group * 16;
    while (below + middleGroups[middleGroup] <= index) {
      below += middleGroups[middleGroup];
      middleGroup++;
    }
    // Search inside the middle group, one value at a time.
    let value = middleGroup << 8;
    while (below + counts[value] <= index) {
      below += counts[value];
      value++;
    }
    return value;
  }
}
