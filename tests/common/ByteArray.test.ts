import { describe, it, expect } from 'vitest';
import { ByteArray } from '@common/ByteArray.js';

describe('ByteArray', () => {
  describe('basic write and read', () => {
    it('starts empty', () => {
      const ba = new ByteArray();
      expect(ba.length).toBe(0);
      expect(ba.position).toBe(0);
      expect(ba.bytesAvailable).toBe(0);
    });

    it('writes and reads a single byte', () => {
      const ba = new ByteArray();
      ba.writeByte(0x42);
      expect(ba.length).toBe(1);

      ba.position = 0;
      expect(ba.readUnsignedByte()).toBe(0x42);
    });

    it('masks writes to 8 bits', () => {
      const ba = new ByteArray();
      ba.writeByte(0x1ff);
      ba.position = 0;
      expect(ba.readUnsignedByte()).toBe(0xff);
    });

    it('reads a big-endian unsigned short', () => {
      const ba = new ByteArray();
      ba.writeByte(0x12);
      ba.writeByte(0x34);
      ba.position = 0;
      expect(ba.readUnsignedShort()).toBe(0x1234);
    });

    it('writes 16-bit values big-endian', () => {
      const ba = new ByteArray();
      ba.writeShort(0xabcd);
      ba.position = 0;
      expect(ba.readUnsignedByte()).toBe(0xab);
      expect(ba.readUnsignedByte()).toBe(0xcd);
    });

    it('writes 24-bit values big-endian', () => {
      const ba = new ByteArray();
      ba.write24Bit(0x123456);
      ba.position = 0;
      expect(ba.readUnsignedByte()).toBe(0x12);
      expect(ba.readUnsignedByte()).toBe(0x34);
      expect(ba.readUnsignedByte()).toBe(0x56);
    });
  });

  describe('range errors', () => {
    it('throws when reading past the end', () => {
      const ba = new ByteArray();
      expect(() => ba.readUnsignedByte()).toThrow(RangeError);
    });

    it('throws when reading a short with only one byte left', () => {
      const ba = new ByteArray();
      ba.writeByte(0x42);
      ba.position = 0;
      expect(() => ba.readUnsignedShort()).toThrow(RangeError);
    });
  });

  describe('strings', () => {
    it('writes and reads a string', () => {
      const ba = new ByteArray();
      ba.writeString('hello');
      ba.position = 0;
      expect(ba.readString()).toBe('hello');
    });

    it('reads a partial string', () => {
      const ba = new ByteArray();
      ba.writeString('hello');
      ba.position = 0;
      expect(ba.readString(3)).toBe('hel');
      expect(ba.readString()).toBe('lo');
    });

    it('auto-clears when fully drained by readString', () => {
      const ba = new ByteArray();
      ba.writeString('hi');
      ba.position = 0;
      ba.readString();
      expect(ba.length).toBe(0);
      expect(ba.position).toBe(0);
    });

    it('toString returns the full contents regardless of position', () => {
      const ba = new ByteArray();
      ba.writeString('hello');
      ba.position = 3;
      expect(ba.toString()).toBe('hello');
      expect(ba.position).toBe(3);
    });
  });

  describe('position and length manipulation', () => {
    it('clamps position to valid range', () => {
      const ba = new ByteArray();
      ba.writeByte(1);
      ba.writeByte(2);
      ba.position = -5;
      expect(ba.position).toBe(0);
      ba.position = 100;
      expect(ba.position).toBe(2);
    });

    it('clear() resets state', () => {
      const ba = new ByteArray();
      ba.writeString('hello');
      ba.clear();
      expect(ba.length).toBe(0);
      expect(ba.position).toBe(0);
    });

    it('length setter shrinks the buffer', () => {
      const ba = new ByteArray();
      ba.writeString('hello');
      ba.length = 3;
      expect(ba.length).toBe(3);
      ba.position = 0;
      expect(ba.readString()).toBe('hel');
    });

    it('length setter clears when zero or negative', () => {
      const ba = new ByteArray();
      ba.writeString('hello');
      ba.length = 0;
      expect(ba.length).toBe(0);
    });
  });

  describe('writeBytes', () => {
    it('copies a full source array', () => {
      const src = new ByteArray();
      src.writeString('hello');
      const dst = new ByteArray();
      dst.writeBytes(src);
      dst.position = 0;
      expect(dst.readString()).toBe('hello');
    });

    it('preserves source position after copy', () => {
      const src = new ByteArray();
      src.writeString('hello');
      src.position = 2;
      const dst = new ByteArray();
      dst.writeBytes(src);
      expect(src.position).toBe(2);
    });
  });
});
