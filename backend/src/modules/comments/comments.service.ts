import { prisma } from '../../config/database.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';
import { getSkip, paginate, type PaginationParams } from '../../utils/pagination.js';

export interface CreateCommentInput {
  content: string;
  parentId?: string;
}

export interface UpdateCommentInput {
  content: string;
}

export class CommentService {
  async getComments(incidentId: string, pagination: PaginationParams) {
    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: {
          incidentId,
          parentId: null,
          isDeleted: false,
          moderationStatus: 'APPROVED',
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              reputationScore: true,
            },
          },
          replies: {
            where: { isDeleted: false, moderationStatus: 'APPROVED' },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
            take: 5,
          },
          _count: {
            select: { replies: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: getSkip(pagination.page, pagination.limit),
        take: pagination.limit,
      }),
      prisma.comment.count({
        where: {
          incidentId,
          parentId: null,
          isDeleted: false,
          moderationStatus: 'APPROVED',
        },
      }),
    ]);

    return paginate(comments, total, pagination);
  }

  async createComment(incidentId: string, userId: string, data: CreateCommentInput) {
    // Check incident exists
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    // Check parent comment if provided
    if (data.parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: data.parentId, incidentId },
      });

      if (!parent) {
        throw new NotFoundError('Parent comment not found');
      }
    }

    const comment = await prisma.comment.create({
      data: {
        incidentId,
        userId,
        content: data.content,
        parentId: data.parentId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Update incident comment count
    await prisma.incident.update({
      where: { id: incidentId },
      data: { commentsCount: { increment: 1 } },
    });

    return comment;
  }

  async updateComment(commentId: string, userId: string, data: UpdateCommentInput) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new ForbiddenError('You can only edit your own comments');
    }

    return prisma.comment.update({
      where: { id: commentId },
      data: {
        content: data.content,
        isEdited: true,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async deleteComment(commentId: string, userId: string, isAdmin = false) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    if (comment.userId !== userId && !isAdmin) {
      throw new ForbiddenError('You can only delete your own comments');
    }

    await prisma.comment.update({
      where: { id: commentId },
      data: { isDeleted: true },
    });

    // Decrement incident comment count
    await prisma.incident.update({
      where: { id: comment.incidentId },
      data: { commentsCount: { decrement: 1 } },
    });
  }

  async upvoteComment(commentId: string, userId: string) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    const existingVote = await prisma.vote.findUnique({
      where: {
        userId_commentId: {
          userId,
          commentId,
        },
      },
    });

    if (existingVote) {
      await prisma.vote.delete({ where: { id: existingVote.id } });
      await prisma.comment.update({
        where: { id: commentId },
        data: { upvotesCount: { decrement: 1 } },
      });
      return { voted: false };
    }

    await prisma.vote.create({
      data: {
        userId,
        commentId,
        voteType: 'UPVOTE',
      },
    });

    await prisma.comment.update({
      where: { id: commentId },
      data: { upvotesCount: { increment: 1 } },
    });

    return { voted: true };
  }

  async reportComment(commentId: string, reporterId: string, reason: string) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    await prisma.moderationQueue.create({
      data: {
        contentType: 'COMMENT',
        contentId: commentId,
        reason: 'REPORTED',
        reportedById: reporterId,
        reportReason: reason,
        priority: 2,
      },
    });

    return { message: 'Comment reported' };
  }
}
