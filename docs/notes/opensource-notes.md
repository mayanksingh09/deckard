## GPU (Used Runpod to decide)
- Chose RTX 4090 because it's not too expensive but is also powerful enough. Also chose RTX 4090 since RTX 5090 is more popular and unavailable more often.
    - RTX 4090 has to use an older version of pytorch (2.2.0 pytorch template + 12.1.1 CUDA) and SadTalker also uses older versions (torch==1.13.1+cu117 torchvision==0.14.1+cu117 torchaudio==0.13.1+cu117)
- Will use RTX 5090 if RTX 4090 is too slow
- Was also considering L40S but I don't think the open source model needs more VRAM since its most likely gonna process short audio clips

## Open Source Models

For open source models, I mainly used the website: https://www.pixaalszo.ai/blog/best-open-source-lip-sync-models to decide which model to use. I first decided to try a model that took an image + audio as input (like D-ID) and had high quality lip-sync. I was deciding between SadTalker and PC-AVS. I decided to choose SadTalker since one of the main limitatiosn of PC-AVS is that it was complex to tune. 

If SadTalker is too slow, I'll tweak the configurations and upgrade the GPU to RTX 5090, and if its still too slow, then I'll look to test MakeItTalk and PIRenderer.

## Setup

Tried using Jupyter Notebook to setup SadTalker but it failed because of matplotlib errors - changed to use terminal and it seems to work now.
- Found that RunPod RTX-4090 instances ship with CUDA 12.x, but SadTalker requires older dependencies, so I had to downgrade PyTorch to torch 1.13.1+cu117 (with matching torchvision + torchaudio) in a virtual environment to maintain compatibility.

## Implementation
- Ended up using SadTalker + RTX 4090 but it ends up being too slow with a batch count of 16 (about 6 seconds for 7 second audio > 5 second delay)
- Would like to test RTX 5090 since I was able to get to 5 seconds with a batch count of 24. 

## Next steps
- RAG and personalization
- Need to add support for concurrent requests on the RunPod server (When several people use Deckard at the same time)
- Memory management: Right now the server stores all the videos created which is not ideal. 
    - It also creates a lot of temporary files in the SadTalker folder
