# Working Notes

# Things tried

1. LivePortrait can create lip sync movement from an image but it's very low quality. But something
2. So one solution is to create any video with a person speaking and then use a seed image of the person to clone to create a lip sync mimicing the movement. But generating the first video will be an issue
3. The way we design is that there's a text model that works in the background and a text to video model that generates the video for lip movement in the background
4. If we use a big enough GPU this might be real time cause we don't really need a big model
5. Add the context in the text model powering the initial prompt generator


Broady this is how it works:

1. A text model that has all the context: LinkedIn past posts, X, google search crawl
2. A customer chats via voice -> voice to text, that's input to the model above
3. Based on context it generates 3 things:
  1) Response to the question
  2) Prompt for the text to video model
  3) Can even create a prompt for a text to image to generate that avatar image
4. The realtime voice API has a VAD to detect when the user is done speaking. See if you can propagate that signal to the text to video model. So the text to video model can generate a video that is synced to the voice, and in the meantime we run a filler video with umm or let me think about it or something like that.