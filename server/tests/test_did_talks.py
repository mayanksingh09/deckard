import struct

from app.services.did_talks import _pcm16le_to_wav


def test_pcm_to_wav_header_and_size():
    # 100 samples of silence (16-bit PCM)
    samples = (b"\x00\x00" * 100)
    wav = _pcm16le_to_wav(samples, sample_rate=24_000, channels=1)
    assert wav[:4] == b"RIFF"
    assert wav[8:12] == b"WAVE"
    # data chunk id
    assert b"data" in wav
    # data size matches input PCM length
    # Find last occurrence of 'data' and read following 4 bytes little-endian length
    idx = wav.rfind(b"data")
    assert idx != -1
    (data_len,) = struct.unpack_from("<I", wav, idx + 4)
    assert data_len == len(samples)
