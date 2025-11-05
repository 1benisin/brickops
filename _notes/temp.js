/* 
###  
# Problem Description  
# At Read we help people monitor meetings. We do that by sending bots so they can collect metrics. To be efficient, it would be great to minimize the number of bots and use them efficiently.  
# To help with this, we need a way to determine the number of bots necessary to process a batch of meetings and way to allocate a schedule for each bot we will be deploying.  
# When possible, we should allocate bots in a way that minimizes the time a bot spends awake but not in a meeting. That is to say, if multiple bots can handle a meeting, lets pick the one who has the least amount of idle time between sessions.  
# Write a performant function that takes a list of meetings (start_time, end_time) as an input and returns a data structure that allocates the minimum number of bots, optimizing for bot idle time when possible.  


# Input: [(1,3), (2,4), (3,5)]  
# One bot per meeting, minimize the number   

# Output: Map[bot -> list of meetings from input]  
# 1 --> (1,3),(3,5) 
# 2 --> (2,4)   


# Input: [(1,3), (2,4), (5,6), (7,8), (4,6)]  
# Input: [(1,3), (2,4), (4,6) (5,6), (7,8), ]  

# Input: [(1,3), (4,6), (7,8)]  
# Input: [(2,4), (5,6)]  

# 1 --> (1,3), (4,6) 
# 2 --> (2,4),(5,6),(7,8)
###
*/

function botScheduler(meetings) {
  if (meetings.length === 0) return [];

  // Sort meetings once by start time
  const sortedMeetings = [...meetings].sort((a, b) => a[0] - b[0]);

  // Track bots: each bot is an array of meetings, last element tells us last end time
  const bots = [];

  for (const meeting of sortedMeetings) {
    const [start, end] = meeting;

    // Find bot with latest end_time that's still available (end_time <= meeting start)
    // This minimizes idle time by picking the bot that finishes closest to when this meeting starts
    let bestBotIndex = -1;
    let latestAvailableEnd = -1;

    for (let i = 0; i < bots.length; i++) {
      const botSchedule = bots[i];
      const lastEnd = botSchedule[botSchedule.length - 1][1];

      if (lastEnd <= start && lastEnd > latestAvailableEnd) {
        latestAvailableEnd = lastEnd;
        bestBotIndex = i;
      }
    }

    // If we found an available bot, assign meeting to it
    if (bestBotIndex !== -1) {
      bots[bestBotIndex].push(meeting);
    } else {
      // No available bot, create a new one
      bots.push([meeting]);
    }
  }

  return bots;
}

// const meetings = [[1,3], [2,4], [5,6], [7,8], [4,6]]
const meetings = [
  [1, 2],
  [2, 3],
  [3, 4],
  [1, 2],
  [2, 3],
  [3, 4],
];

// [[1,2] [2,3], [3,4]] , [[1,2] [2,3], [3,4]]
console.log(botScheduler(meetings));
