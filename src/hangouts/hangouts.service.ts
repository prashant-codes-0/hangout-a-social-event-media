import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Hangout } from './schemas/hangout.schema';
import { JoinRequest, JoinRequestStatus } from './schemas/join-request.schema';
import { User, UserRole } from '../auth/schemas/user.schema';
import { CreateHangoutDto, UpdateHangoutDto } from './dto/hangout.dto';

@Injectable()
export class HangoutsService {
  constructor(
    @InjectModel(Hangout.name)
    private hangoutModel: Model<Hangout>,
    @InjectModel(JoinRequest.name)
    private joinRequestModel: Model<JoinRequest>,
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  async create(createHangoutDto: CreateHangoutDto, userId: string) {
    const user = await this.userModel.findById(userId);
    
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    if (!user.verified && user.role === UserRole.USER) {
      throw new ForbiddenException('Only verified users can create hangouts');
    }

    const hangout = new this.hangoutModel({
      ...createHangoutDto,
      time: new Date(createHangoutDto.time),
      createdBy: userId,
    });

    return hangout.save();
  }

  async findAll(filters?: { purpose?: string; place?: string; date?: string }) {
    const query: any = { isPublic: true };

    if (filters?.purpose) {
      query.purpose = { $regex: filters.purpose, $options: 'i' };
    }

    if (filters?.place) {
      query.place = { $regex: filters.place, $options: 'i' };
    }

    if (filters?.date) {
      const startDate = new Date(filters.date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      
      query.time = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    return this.hangoutModel
      .find(query)
      .populate('createdBy', 'name email')
      .exec();
  }

  async findOne(id: string) {
    const hangout = await this.hangoutModel
      .findById(id)
      .populate('createdBy', 'name email')
      .populate('attendees', 'name email')
      .exec();

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Get join requests for this hangout
    const joinRequests = await this.joinRequestModel
      .find({ hangoutId: id })
      .populate('userId', 'name email')
      .exec();

    return {
      ...hangout.toObject(),
      joinRequests,
    };
  }

  async update(id: string, updateHangoutDto: UpdateHangoutDto, userId: string) {
    const hangout = await this.hangoutModel.findById(id);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    if (hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only update your own hangouts');
    }

    const updateData = { ...updateHangoutDto };
    if (updateHangoutDto.time) {
      updateData.time = new Date(updateHangoutDto.time) as any;
    }

    await this.hangoutModel.findByIdAndUpdate(id, updateData);
    return this.findOne(id);
  }

  async remove(id: string, userId: string) {
    const hangout = await this.hangoutModel.findById(id);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    if (hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own hangouts');
    }

    await this.hangoutModel.findByIdAndDelete(id);
    await this.joinRequestModel.deleteMany({ hangoutId: id });
    return { message: 'Hangout deleted successfully' };
  }

  async requestToJoin(hangoutId: string, userId: string) {
    const hangout = await this.hangoutModel.findById(hangoutId);
    
    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }
    
    // Check if user already has a request
    const existingRequest = await this.joinRequestModel.findOne({
      hangoutId,
      userId,
    });

    if (existingRequest) {
      throw new BadRequestException('You already have a request for this hangout');
    }

    // Check if hangout is full
    if (hangout.attendees.length >= hangout.capacity) {
      throw new BadRequestException('This hangout is full');
    }

    const joinRequest = new this.joinRequestModel({
      hangoutId,
      userId,
    });

    return joinRequest.save();
  }

  async handleJoinRequest(requestId: string, status: JoinRequestStatus, userId: string) {
    const joinRequest = await this.joinRequestModel
      .findById(requestId)
      .populate('hangoutId')
      .exec();

    if (!joinRequest) {
      throw new NotFoundException('Join request not found');
    }

    const hangout = await this.hangoutModel.findById(joinRequest.hangoutId);
    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    if (hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only handle requests for your own hangouts');
    }

    joinRequest.status = status;
    await joinRequest.save();

    // If approved, add user to attendees
    if (status === JoinRequestStatus.APPROVED) {
      if (!hangout.attendees.includes(joinRequest.userId)) {
        hangout.attendees.push(joinRequest.userId);
        await hangout.save();
      }
    }

    return joinRequest;
  }

  async addBlast(hangoutId: string) {
    const hangout = await this.hangoutModel.findById(hangoutId);
    
    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }
    
    hangout.blasts += 1;
    return hangout.save();
  }
}