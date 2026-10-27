import numpy as np


def decode(probs, id_to_token, pad_id, frame_seconds=0.02):
    ids = np.argmax(probs, axis=1)
    tokens = []
    start = 0
    while start < len(ids):
        token_id = int(ids[start])
        end = start + 1
        while end < len(ids) and ids[end] == token_id:
            end += 1
        if token_id != pad_id:
            mean = np.mean(probs[start:end], axis=0)
            best = np.argsort(-mean, kind='stable')[:5]
            tokens.append({
                'token': id_to_token[token_id],
                'start': round(start * frame_seconds, 2),
                'end': round(end * frame_seconds, 2),
                'top': [[id_to_token[int(index)], round(float(mean[index]), 3)] for index in best],
            })
        start = end
    return tokens
