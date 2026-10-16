#!/bin/sh
# Trim silence, pitch the 华叔 lines down 1.5 semitones (Kokoro only; set NO_PITCH=1 for other engines),
# loudness-normalise to -16 LUFS, 48 kHz mono.
# usage: sh voice_post.sh ID [ID ...]   (reads assets/voice/raw_ID.wav|aiff, writes assets/voice/ID.wav)
cd "$(dirname "$0")/../assets/voice" || exit 1
TRIM="silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.06,areverse"
for id in "$@"; do
  src=$(ls raw_"$id".* | head -1)
  case $id in H*) PRE="asetrate=24000*0.9170,aresample=24000,atempo=1.0905," ;; *) PRE="" ;; esac
  [ -n "$NO_PITCH" ] && PRE=""
  ffmpeg -v error -y -i "$src" -af "${PRE}${TRIM},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" -ac 1 -c:a pcm_s16le "$id.wav"
  echo "$id $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$id.wav")"
done
